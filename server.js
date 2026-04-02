const express = require("express");
const session = require("express-session");
const fileUpload = require("express-fileupload");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const app = express();

// ===== MIDDLEWARE =====
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload());

app.use(session({
  secret: "aurythos_secret_key",
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

app.use(express.static("public"));

// ===== INIT =====
if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");
if (!fs.existsSync("users.json")) fs.writeFileSync("users.json", "{}");

// ===== USER KEY GENERATION =====
function generateUserKey(password) {
  return crypto.createHash("sha256").update(password).digest();
}

// ===== ENCRYPT (AES-256-GCM) =====
function encrypt(buffer, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, encrypted]);
}

// ===== DECRYPT =====
function decrypt(buffer, key) {
  const iv = buffer.slice(0, 12);
  const tag = buffer.slice(12, 28);
  const encrypted = buffer.slice(28);

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

// ===== REGISTER =====
app.post("/register", async (req, res) => {
  const { username, password } = req.body;

  const users = JSON.parse(fs.readFileSync("users.json"));

  if (users[username]) return res.send("User exists");

  const hashed = await bcrypt.hash(password, 10);

  users[username] = {
    password: hashed
  };

  fs.writeFileSync("users.json", JSON.stringify(users, null, 2));

  fs.mkdirSync("./uploads/" + username, { recursive: true });

  req.session.user = username;
  req.session.key = generateUserKey(password);

  res.redirect("/vault");
});

// ===== LOGIN =====
app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  const users = JSON.parse(fs.readFileSync("users.json"));

  if (!users[username]) return res.send("User not found");

  const match = await bcrypt.compare(password, users[username].password);

  if (!match) return res.send("Wrong password");

  req.session.user = username;
  req.session.key = generateUserKey(password);

  res.redirect("/vault");
});

// ===== VAULT =====
app.get("/vault", (req, res) => {
  if (!req.session.user) return res.redirect("/");
  res.sendFile(__dirname + "/public/vault.html");
});

// ===== FILE LIST =====
app.get("/files", (req, res) => {
  if (!req.session.user) return res.json([]);

  const dir = "./uploads/" + req.session.user;
  if (!fs.existsSync(dir)) return res.json([]);

  res.json(fs.readdirSync(dir));
});

// ===== UPLOAD (ENCRYPTED PER USER) =====
app.post("/upload", (req, res) => {
  if (!req.session.user) return res.redirect("/");

  const key = req.session.key;

  if (!req.files) return res.redirect("/vault");

  const files = Array.isArray(req.files.file)
    ? req.files.file
    : [req.files.file];

  files.forEach(f => {
    const encrypted = encrypt(f.data, key);

    fs.writeFileSync(
      "./uploads/" + req.session.user + "/" + f.name,
      encrypted
    );
  });

  res.redirect("/vault");
});

// ===== PREVIEW (PRO LEVEL) =====
app.get("/preview/:name", (req, res) => {
  if (!req.session.user) return res.sendStatus(401);

  const key = req.session.key;
  const fileName = decodeURIComponent(req.params.name);

  const filePath = path.join(__dirname, "uploads", req.session.user, fileName);

  if (!fs.existsSync(filePath)) return res.send("File not found");

  try {
    const encrypted = fs.readFileSync(filePath);
    const decrypted = decrypt(encrypted, key);

    // detect type
    if (fileName.endsWith(".pdf")) {
      res.setHeader("Content-Type", "application/pdf");
    } else if (fileName.match(/\.(jpg|jpeg|png)$/)) {
      res.setHeader("Content-Type", "image/jpeg");
    } else {
      res.setHeader("Content-Type", "application/octet-stream");
    }

    res.send(decrypted);
  } catch (err) {
    res.send("Preview failed (wrong key or corrupted file)");
  }
});

// ===== DOWNLOAD =====
app.get("/download/:name", (req, res) => {
  if (!req.session.user) return res.redirect("/");

  const key = req.session.key;
  const fileName = decodeURIComponent(req.params.name);

  const filePath = "./uploads/" + req.session.user + "/" + fileName;

  const encrypted = fs.readFileSync(filePath);
  const decrypted = decrypt(encrypted, key);

  res.setHeader("Content-Disposition", "attachment; filename=" + fileName);
  res.send(decrypted);
});

// ===== DELETE =====
app.get("/delete/:name", (req, res) => {
  if (!req.session.user) return res.redirect("/");

  const file = "./uploads/" + req.session.user + "/" + decodeURIComponent(req.params.name);

  if (fs.existsSync(file)) fs.unlinkSync(file);

  res.redirect("/vault");
});

// ===== SHARE (USER → USER ENCRYPTED TRANSFER) =====
app.post("/send", (req, res) => {
  if (!req.session.user) return res.json({ success: false });

  const { toUser, fileName } = req.body;

  const users = JSON.parse(fs.readFileSync("users.json"));

  if (!users[toUser]) {
    return res.json({ success: false, message: "User not found" });
  }

  const srcPath = "./uploads/" + req.session.user + "/" + fileName;
  const destPath = "./uploads/" + toUser + "/" + fileName;

  fs.copyFileSync(srcPath, destPath);

  res.json({ success: true });
});

// ===== LOGOUT =====
app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

// ===== START =====
const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});

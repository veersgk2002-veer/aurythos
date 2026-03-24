const express = require("express");
const session = require("express-session");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");

const app = express();

// ===== CONFIG =====
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static("public"));

app.use(session({
  secret: "supersecret",
  resave: false,
  saveUninitialized: false
}));

// ===== ENSURE UPLOAD FOLDER =====
if (!fs.existsSync("uploads")) {
  fs.mkdirSync("uploads");
}

// ===== STORAGE =====
const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  }
});

const upload = multer({ storage });

// ===== TEMP DATABASE =====
let users = {};
let filesDB = {};

// ===== AUTH =====
function auth(req, res, next) {
  if (!req.session.user) return res.redirect("/");
  next();
}

// ===== ENCRYPTION (FIXED) =====
function getKey(username) {
  return crypto.createHash("sha256")
    .update(username + "_vault_secret")
    .digest();
}

function encrypt(buffer, key) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);

  const encrypted = Buffer.concat([
    cipher.update(buffer),
    cipher.final()
  ]);

  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

// ===== ROUTES =====

// REGISTER
app.post("/register", async (req, res) => {
  const { username, password } = req.body;

  if (users[username]) return res.send("User exists");

  const hash = await bcrypt.hash(password, 10);

  users[username] = { password: hash };
  filesDB[username] = [];

  req.session.user = username;
  res.redirect("/dashboard.html");
});

// LOGIN
app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  const user = users[username];
  if (!user) return res.send("User not found");

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.send("Wrong password");

  req.session.user = username;
  res.redirect("/dashboard.html");
});

// GET FILES
app.get("/files", auth, (req, res) => {
  res.json(filesDB[req.session.user] || []);
});

// UPLOAD (FIXED)
app.post("/upload", auth, upload.array("files"), (req, res) => {
  try {
    const username = req.session.user;
    const key = getKey(username);

    if (!req.files || req.files.length === 0) {
      return res.send("No files");
    }

    if (!filesDB[username]) filesDB[username] = [];

    req.files.forEach(file => {
      const buffer = fs.readFileSync(file.path);

      const encrypted = encrypt(buffer, key);

      fs.writeFileSync(file.path, encrypted);

      filesDB[username].push({
        id: uuidv4(),
        name: file.originalname,
        path: file.path,
        size: file.size
      });
    });

    res.redirect("/dashboard.html");

  } catch (err) {
    console.error(err);
    res.send("Upload failed");
  }
});

// DOWNLOAD
app.get("/download/:id", auth, (req, res) => {
  const username = req.session.user;
  const file = filesDB[username].find(f => f.id === req.params.id);

  if (!file) return res.send("File not found");

  res.download(file.path, file.name);
});

// DELETE
app.get("/delete/:id", auth, (req, res) => {
  const username = req.session.user;
  const index = filesDB[username].findIndex(f => f.id === req.params.id);

  if (index === -1) return res.send("Not found");

  const file = filesDB[username][index];

  if (fs.existsSync(file.path)) {
    fs.unlinkSync(file.path);
  }

  filesDB[username].splice(index, 1);

  res.redirect("/dashboard.html");
});

// SHARE
app.get("/share/:id", (req, res) => {
  let found;

  for (let u in filesDB) {
    const f = filesDB[u].find(x => x.id === req.params.id);
    if (f) {
      found = f;
      break;
    }
  }

  if (!found) return res.send("Not found");

  res.download(found.path, found.name);
});

// LOGOUT
app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/");
});

// ===== START =====
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("Server running on " + PORT));

// ===== ERROR DEBUG =====
process.on("uncaughtException", err => console.error(err));
process.on("unhandledRejection", err => console.error(err));

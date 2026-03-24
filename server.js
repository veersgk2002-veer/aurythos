const express = require("express");
const session = require("express-session");
const multer = require("multer");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const app = express();

// ===== CONFIG =====
const PORT = process.env.PORT || 3000;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const BUCKET = "files";

// ===== TEMP FOLDER =====
if (!fs.existsSync("./temp")) fs.mkdirSync("./temp");

// ===== ENCRYPTION =====
const ALGO = "aes-256-cbc";

function getKey(password) {
  return crypto.createHash("sha256").update(password).digest();
}

function encrypt(buffer, key) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  return Buffer.concat([iv, cipher.update(buffer), cipher.final()]);
}

function decrypt(buffer, key) {
  const iv = buffer.slice(0, 16);
  const data = buffer.slice(16);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

// ===== MIDDLEWARE =====
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(
  session({
    secret: "aurythos-secret",
    resave: false,
    saveUninitialized: false,
  })
);

// ===== MULTER =====
const storage = multer.diskStorage({
  destination: "./temp",
  filename: (req, file, cb) => {
    cb(null, Date.now() + "_" + file.originalname.replace(/\s/g, "_"));
  },
});

const upload = multer({ storage });

// ===== MEMORY DB =====
let users = {};

// ===== AUTH =====
function auth(req, res, next) {
  if (!req.session.user || !req.session.key) return res.redirect("/");
  next();
}

// ===== HOME =====
app.get("/", (req, res) => {
  res.send(`
  <html>
  <head>
  <style>
    body { background:#0f2027; color:white; font-family:sans-serif; display:flex; justify-content:center; align-items:center; height:100vh;}
    .box { background:#1c3b45; padding:25px; border-radius:10px; width:300px;}
    input,button { width:100%; padding:8px; margin:5px 0;}
  </style>
  </head>
  <body>
    <div class="box">
      <h2>Aurythos Vault</h2>

      <form method="POST" action="/login">
        <input name="username" placeholder="Username" required/>
        <input type="password" name="password" placeholder="Password" required/>
        <button>Login</button>
      </form>

      <br/>

      <form method="POST" action="/register">
        <input name="username" placeholder="Username" required/>
        <input type="password" name="password" placeholder="Password" required/>
        <button>Register</button>
      </form>
    </div>
  </body>
  </html>
  `);
});

// ===== REGISTER =====
app.post("/register", async (req, res) => {
  const { username, password } = req.body;

  if (users[username]) return res.send("User exists");

  users[username] = {
    password: await bcrypt.hash(password, 10),
    plan: "free",
  };

  req.session.user = username;
  req.session.key = getKey(password);

  res.redirect("/dashboard");
});

// ===== LOGIN =====
app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  const user = users[username];
  if (!user) return res.send("User not found");

  if (!(await bcrypt.compare(password, user.password)))
    return res.send("Wrong password");

  req.session.user = username;
  req.session.key = getKey(password);

  res.redirect("/dashboard");
});

// ===== DASHBOARD =====
app.get("/dashboard", auth, async (req, res) => {
  const username = req.session.user;

  const { data } = await supabase.storage.from(BUCKET).list(username);

  let filesHTML = "";

  if (data && data.length > 0) {
    data.forEach((f) => {
      filesHTML += `
      <div class="file">
        <b>${f.name}</b><br/>
        <a href="/download/${f.name}">Download</a> |
        <a href="/delete/${f.name}">Delete</a>
      </div>`;
    });
  } else {
    filesHTML = "<p>No files uploaded</p>";
  }

  res.send(`
  <html>
  <head>
  <style>
    body { background:#0f2027; color:white; font-family:sans-serif; padding:20px;}
    .file { background:#ffffff10; padding:10px; margin:10px; border-radius:8px;}
    button,input { padding:6px; margin:5px;}
  </style>
  </head>
  <body>

    <h2>Welcome ${username}</h2>

    <a href="/upgrade">Upgrade to Premium</a>

    <form method="POST" action="/upload" enctype="multipart/form-data">
      <input type="file" name="files" multiple required/>
      <button>Upload</button>
    </form>

    <h3>Your Files</h3>
    ${filesHTML}

    <br/>
    <a href="/logout">Logout</a>

  </body>
  </html>
  `);
});

// ===== MULTIPLE UPLOAD =====
app.post("/upload", auth, upload.array("files", 10), async (req, res) => {
  const username = req.session.user;

  const { data } = await supabase.storage.from(BUCKET).list(username);

  if (users[username].plan === "free" && data.length + req.files.length > 3) {
    return res.send("Free plan limit = 3 files");
  }

  for (let file of req.files) {
    const buffer = fs.readFileSync(file.path);
    const encrypted = encrypt(buffer, req.session.key);

    await supabase.storage
      .from(BUCKET)
      .upload(`${username}/${file.filename}`, encrypted);

    fs.unlinkSync(file.path);
  }

  res.redirect("/dashboard");
});

// ===== DOWNLOAD =====
app.get("/download/:file", auth, async (req, res) => {
  const username = req.session.user;

  const { data } = await supabase.storage
    .from(BUCKET)
    .download(`${username}/${req.params.file}`);

  const buffer = Buffer.from(await data.arrayBuffer());
  const decrypted = decrypt(buffer, req.session.key);

  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${req.params.file}"`
  );

  res.send(decrypted);
});

// ===== DELETE =====
app.get("/delete/:file", auth, async (req, res) => {
  const username = req.session.user;

  await supabase.storage
    .from(BUCKET)
    .remove([`${username}/${req.params.file}`]);

  res.redirect("/dashboard");
});

// ===== UPGRADE =====
app.get("/upgrade", auth, (req, res) => {
  users[req.session.user].plan = "premium";
  res.send("Premium Activated ✅");
});

// ===== LOGOUT =====
app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

// ===== SERVER =====
app.listen(PORT, () => {
  console.log("Running on port", PORT);
});

require("dotenv").config();
const express = require("express");
const session = require("express-session");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const app = express();

// ===== CONFIG =====
const PORT = process.env.PORT || 10000;

// SAFE SECRET (NO CRYPTO ERROR)
const SECRET = process.env.SECRET_KEY || "aurythos_secret_key";

// ===== MIDDLEWARE =====
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
  secret: SECRET,
  resave: false,
  saveUninitialized: true
}));

app.use(express.static("public"));

// ===== STORAGE =====
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const user = req.session.user;
    if (!user) return cb(new Error("Not logged in"));

    const dir = `uploads/${user}`;
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    cb(null, dir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  }
});

const upload = multer({ storage });

// ===== USERS FILE =====
const USERS_FILE = "users.json";
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, "{}");

// ===== ROUTES =====

// Home
app.get("/", (req, res) => {
  if (!req.session.user) {
    return res.sendFile(path.join(__dirname, "public/index.html"));
  } else {
    return res.redirect("/dashboard");
  }
});

// Register
app.post("/register", (req, res) => {
  const { username, password } = req.body;

  const users = JSON.parse(fs.readFileSync(USERS_FILE));
  if (users[username]) return res.send("User exists");

  users[username] = password;
  fs.writeFileSync(USERS_FILE, JSON.stringify(users));

  res.redirect("/");
});

// Login
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  const users = JSON.parse(fs.readFileSync(USERS_FILE));
  if (users[username] !== password) {
    return res.send("Invalid login");
  }

  req.session.user = username;
  res.redirect("/dashboard");
});

// Dashboard
app.get("/dashboard", (req, res) => {
  if (!req.session.user) return res.redirect("/");

  const dir = `uploads/${req.session.user}`;
  let files = [];

  if (fs.existsSync(dir)) {
    files = fs.readdirSync(dir);
  }

  let fileList = files.map(f => `
    <li>
      ${f}
      <a href="/download/${f}">Download</a>
      <a href="/delete/${f}">Delete</a>
    </li>
  `).join("");

  res.send(`
  <html>
  <head>
    <title>Dashboard</title>
    <style>
      body { background:#0e2a30; color:white; font-family:sans-serif; text-align:center; }
      .box { margin:40px auto; padding:20px; background:#1f3d44; width:90%; max-width:400px; border-radius:10px; }
      input, button { margin:10px; padding:10px; width:90%; }
    </style>
  </head>
  <body>
    <div class="box">
      <h2>Welcome ${req.session.user}</h2>

      <form action="/upload" method="post" enctype="multipart/form-data">
        <input type="file" name="files" multiple required />
        <button type="submit">Upload</button>
      </form>

      <h3>Your Files</h3>
      <ul>${fileList || "No files"}</ul>

      <a href="/logout">Logout</a>
    </div>
  </body>
  </html>
  `);
});

// Upload (MULTIPLE FILES)
app.post("/upload", upload.array("files"), (req, res) => {
  res.redirect("/dashboard");
});

// Download
app.get("/download/:file", (req, res) => {
  const file = path.join(__dirname, "uploads", req.session.user, req.params.file);
  res.download(file);
});

// Delete
app.get("/delete/:file", (req, res) => {
  const file = path.join(__dirname, "uploads", req.session.user, req.params.file);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  res.redirect("/dashboard");
});

// Logout
app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/");
});

// START
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});

const express = require("express");
const fileUpload = require("express-fileupload");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 4000;

// ===== PATH FIX FOR RENDER =====
const DATA_PATH = process.env.NODE_ENV === "production" ? "/tmp" : __dirname;
const UPLOAD_PATH = path.join(DATA_PATH, "uploads");

if (!fs.existsSync(UPLOAD_PATH)) fs.mkdirSync(UPLOAD_PATH);
if (!fs.existsSync(path.join(DATA_PATH, "users.json"))) fs.writeFileSync(path.join(DATA_PATH, "users.json"), "[]");
if (!fs.existsSync(path.join(DATA_PATH, "files.json"))) fs.writeFileSync(path.join(DATA_PATH, "files.json"), "[]");

// ===== MIDDLEWARE =====
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload());
app.use(express.static("public"));

// ===== AUTH =====
function auth(req, res, next) {
  const token = req.headers.authorization;
  const users = JSON.parse(fs.readFileSync(path.join(DATA_PATH, "users.json")));

  const user = users.find(u => u.token === token);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  req.user = user;
  next();
}

// ===== REGISTER =====
app.post("/register", async (req, res) => {
  const { username, password } = req.body;
  let users = JSON.parse(fs.readFileSync(path.join(DATA_PATH, "users.json")));

  if (users.find(u => u.username === username)) {
    return res.json({ error: "User exists" });
  }

  const hash = await bcrypt.hash(password, 10);
  users.push({ username, password: hash });

  fs.writeFileSync(path.join(DATA_PATH, "users.json"), JSON.stringify(users));
  res.json({ success: true });
});

// ===== LOGIN =====
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  let users = JSON.parse(fs.readFileSync(path.join(DATA_PATH, "users.json")));

  const user = users.find(u => u.username === username);
  if (!user) return res.json({ error: "User not found" });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.json({ error: "Wrong password" });

  const token = crypto.randomBytes(16).toString("hex");
  user.token = token;

  fs.writeFileSync(path.join(DATA_PATH, "users.json"), JSON.stringify(users));
  res.json({ token });
});

// ===== UPLOAD =====
app.post("/upload", auth, (req, res) => {
  if (!req.files) return res.json({ error: "No file" });

  const file = req.files.file;
  const filename = Date.now() + "_" + file.name;

  file.mv(path.join(UPLOAD_PATH, filename));

  let files = JSON.parse(fs.readFileSync(path.join(DATA_PATH, "files.json")));

  files.push({
    owner: req.user.username,
    filename,
    original: file.name,
    shared: []
  });

  fs.writeFileSync(path.join(DATA_PATH, "files.json"), JSON.stringify(files));
  res.json({ success: true });
});

// ===== LIST FILES =====
app.get("/files", auth, (req, res) => {
  const files = JSON.parse(fs.readFileSync(path.join(DATA_PATH, "files.json")));

  const userFiles = files.filter(
    f => f.owner === req.user.username || f.shared.includes(req.user.username)
  );

  res.json(userFiles);
});

// ===== DOWNLOAD =====
app.get("/download/:name", auth, (req, res) => {
  const filePath = path.join(UPLOAD_PATH, req.params.name);

  if (!fs.existsSync(filePath)) {
    return res.json({ error: "File not found" });
  }

  res.download(filePath);
});

// ===== DELETE =====
app.delete("/delete/:name", auth, (req, res) => {
  let files = JSON.parse(fs.readFileSync(path.join(DATA_PATH, "files.json")));

  const file = files.find(f => f.filename === req.params.name);

  if (!file || file.owner !== req.user.username) {
    return res.json({ error: "Not allowed" });
  }

  const filePath = path.join(UPLOAD_PATH, req.params.name);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  files = files.filter(f => f.filename !== req.params.name);

  fs.writeFileSync(path.join(DATA_PATH, "files.json"), JSON.stringify(files));
  res.json({ success: true });
});

// ===== SHARE =====
app.post("/share", auth, (req, res) => {
  const { filename, toUser } = req.body;
  let files = JSON.parse(fs.readFileSync(path.join(DATA_PATH, "files.json")));

  const file = files.find(f => f.filename === filename);

  if (!file || file.owner !== req.user.username) {
    return res.json({ error: "Not allowed" });
  }

  if (!file.shared.includes(toUser)) {
    file.shared.push(toUser);
  }

  fs.writeFileSync(path.join(DATA_PATH, "files.json"), JSON.stringify(files));
  res.json({ success: true });
});

app.listen(PORT, () => console.log("Server running on", PORT));

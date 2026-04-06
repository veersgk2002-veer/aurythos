const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const USERS_FILE = "users.json";
const SECRET = "mysecretkey"; // later we will secure this

if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, "[]");
}

// ---------- STORAGE ----------
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const user = req.user.username;

    const userDir = path.join(__dirname, "uploads", user);
    fs.mkdirSync(userDir, { recursive: true });

    cb(null, userDir);
  },
  filename: function (req, file, cb) {
    cb(null, uuidv4() + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

// ---------- AUTH MIDDLEWARE ----------
function auth(req, res, next) {
  const token = req.headers.authorization;

  if (!token) return res.status(401).json({ error: "No token" });

  try {
    const decoded = jwt.verify(token, SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

// ---------- REGISTER ----------
app.post("/register", async (req, res) => {
  const { username, password } = req.body;

  let users = JSON.parse(fs.readFileSync(USERS_FILE));

  if (users.find(u => u.username === username)) {
    return res.json({ success: false });
  }

  const hashed = await bcrypt.hash(password, 10);

  users.push({ username, password: hashed });
  fs.writeFileSync(USERS_FILE, JSON.stringify(users));

  res.json({ success: true });
});

// ---------- LOGIN ----------
app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  let users = JSON.parse(fs.readFileSync(USERS_FILE));

  const user = users.find(u => u.username === username);

  if (!user) return res.json({ success: false });

  const match = await bcrypt.compare(password, user.password);

  if (!match) return res.json({ success: false });

  const token = jwt.sign({ username }, SECRET);

  res.json({ success: true, token });
});

// ---------- UPLOAD ----------
app.post("/upload", auth, upload.single("file"), (req, res) => {
  res.json({ success: true });
});

// ---------- GET FILES ----------
app.get("/files", auth, (req, res) => {
  const user = req.user.username;

  const userDir = path.join(__dirname, "uploads", user);

  if (!fs.existsSync(userDir)) {
    return res.json([]);
  }

  const files = fs.readdirSync(userDir);
  res.json(files);
});

// ---------- DOWNLOAD ----------
app.get("/download/:filename", auth, (req, res) => {
  const user = req.user.username;
  const file = req.params.filename;

  const filePath = path.join(__dirname, "uploads", user, file);

  res.download(filePath);
});

// ---------- START ----------
app.listen(4000, "0.0.0.0", () => {
  console.log("🔐 Secure Server running on http://localhost:4000");
});

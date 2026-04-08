require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");

const app = express();

// ===== Middleware =====
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

// ===== MongoDB =====
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("MongoDB connected"))
.catch(err => console.log(err));

// ===== Models =====
const User = mongoose.model("User", {
  username: { type: String, unique: true },
  password: String
});

// ===== Auth Middleware =====
function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.send("No token");

  const token = header.split(" ")[1];

  try {
    const decoded = jwt.verify(token, "secret123");
    req.user = decoded.username;
    next();
  } catch {
    res.send("Invalid token");
  }
}

// ===== Storage =====
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = "uploads/" + req.user;
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  }
});

const upload = multer({ storage });

// ===== ROUTES =====

// Register
app.post("/api/register", async (req, res) => {
  const { username, password } = req.body;

  const hash = await bcrypt.hash(password, 10);

  try {
    await User.create({ username, password: hash });
    res.json({ message: "Registered" });
  } catch {
    res.json({ message: "User exists" });
  }
});

// Login
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;

  const user = await User.findOne({ username });
  if (!user) return res.json({ message: "No user" });

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.json({ message: "Wrong password" });

  const token = jwt.sign({ username }, "secret123");

  res.json({ token });
});

// Upload
app.post("/api/upload", auth, upload.array("files"), (req, res) => {
  res.json({ message: "Uploaded" });
});

// Files list
app.get("/api/files", auth, (req, res) => {
  const dir = "uploads/" + req.user;
  if (!fs.existsSync(dir)) return res.json([]);
  res.json(fs.readdirSync(dir));
});

// Download
app.get("/api/download/:file", auth, (req, res) => {
  const filePath = "uploads/" + req.user + "/" + req.params.file;
  if (!fs.existsSync(filePath)) return res.send("Not found");
  res.download(filePath);
});

// Delete
app.delete("/api/delete/:file", auth, (req, res) => {
  const filePath = "uploads/" + req.user + "/" + req.params.file;
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  res.send("Deleted");
});

// ===== START =====
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log("Server running"));

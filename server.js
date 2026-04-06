const express = require("express");
<<<<<<< HEAD
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
=======
const session = require("express-session");
const fileUpload = require("express-fileupload");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");

const app = express();

// ===== CONFIG =====
const PORT = process.env.PORT || 4000;
const DATA_PATH = __dirname;
const UPLOAD_PATH = path.join(__dirname, "uploads");

// ensure files exist
if (!fs.existsSync(UPLOAD_PATH)) fs.mkdirSync(UPLOAD_PATH);
if (!fs.existsSync("users.json")) fs.writeFileSync("users.json", "[]");
if (!fs.existsSync("files.json")) fs.writeFileSync("files.json", "[]");

// ===== MIDDLEWARE =====
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload());

app.use(session({
  secret: "aurythos_secret",
  resave: false,
  saveUninitialized: false
}));

app.use(express.static("public"));

// ===== HELPERS =====
function readJSON(file) {
  return JSON.parse(fs.readFileSync(path.join(DATA_PATH, file)));
}

function writeJSON(file, data) {
  fs.writeFileSync(path.join(DATA_PATH, file), JSON.stringify(data, null, 2));
}

// ===== REGISTER =====
app.post("/register", async (req, res) => {
  const { username, password } = req.body;

  let users = readJSON("users.json");

  if (users.find(u => u.username === username)) {
    return res.json({ success: false, message: "User exists" });
>>>>>>> 3d18c41a99335717849f8471a319cac1bad42ccb
  }

  const hashed = await bcrypt.hash(password, 10);

  users.push({ username, password: hashed });
<<<<<<< HEAD
  fs.writeFileSync(USERS_FILE, JSON.stringify(users));
=======
  writeJSON("users.json", users);
>>>>>>> 3d18c41a99335717849f8471a319cac1bad42ccb

  res.json({ success: true });
});

<<<<<<< HEAD
// ---------- LOGIN ----------
app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  let users = JSON.parse(fs.readFileSync(USERS_FILE));

=======
// ===== LOGIN =====
app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  let users = readJSON("users.json");
>>>>>>> 3d18c41a99335717849f8471a319cac1bad42ccb
  const user = users.find(u => u.username === username);

  if (!user) return res.json({ success: false });

  const match = await bcrypt.compare(password, user.password);

  if (!match) return res.json({ success: false });

<<<<<<< HEAD
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
=======
  req.session.user = username;
  res.json({ success: true });
});

// ===== UPLOAD =====
app.post("/upload", (req, res) => {
  if (!req.session.user) return res.sendStatus(401);

  const file = req.files.file;
  const filename = Date.now() + "_" + file.name;

  const filepath = path.join(UPLOAD_PATH, filename);
  file.mv(filepath);

  let files = readJSON("files.json");
  files.push({ owner: req.session.user, name: filename });

  writeJSON("files.json", files);

  res.json({ success: true });
});

// ===== GET FILES =====
app.get("/files", (req, res) => {
  if (!req.session.user) return res.sendStatus(401);

  let files = readJSON("files.json");
  const userFiles = files.filter(f => f.owner === req.session.user);

  res.json(userFiles);
});

// ===== DOWNLOAD =====
app.get("/download/:name", (req, res) => {
  const filePath = path.join(UPLOAD_PATH, req.params.name);
  res.download(filePath);
});

// ===== DELETE =====
app.post("/delete", (req, res) => {
  const { name } = req.body;

  let files = readJSON("files.json");
  files = files.filter(f => f.name !== name);

  writeJSON("files.json", files);

  fs.unlinkSync(path.join(UPLOAD_PATH, name));

  res.json({ success: true });
});

// ===== SHARE =====
app.post("/share", (req, res) => {
  const { name, toUser } = req.body;

  let files = readJSON("files.json");

  files.push({ owner: toUser, name });

  writeJSON("files.json", files);

  res.json({ success: true });
});

// ===== LOGOUT =====
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

// ===== START =====
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
>>>>>>> 3d18c41a99335717849f8471a319cac1bad42ccb
});

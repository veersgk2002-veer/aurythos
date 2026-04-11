require('dotenv').config();

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const SECRET = "vault_secret";

if (!fs.existsSync('./uploads')) {
  fs.mkdirSync('./uploads', { recursive: true });
}
/* ================= STORAGE ================= */
if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

const upload = multer({ storage: multer.memoryStorage() });

/* ================= JSON ================= */
function readJSON(file) {
  try {
    if (!fs.existsSync(file)) return [];
    const data = fs.readFileSync(file);
    return data.length ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

/* ================= AUTH ================= */
function auth(req, res, next) {
  const token = req.headers.authorization;
  if (!token) return res.sendStatus(401);

  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.sendStatus(403);
  }
}

/* ================= AUTH ROUTES ================= */
app.post('/api/register', (req, res) => {
  const users = readJSON('users.json');
  const { username, password } = req.body;

  if (users.find(u => u.username === username)) {
    return res.json({ msg: "User exists" });
  }

  const hash = bcrypt.hashSync(password, 10);
  users.push({ username, password: hash });

  writeJSON('users.json', users);
  res.json({ msg: "Account created" });
});

app.post('/api/login', (req, res) => {
  const users = readJSON('users.json');
  const { username, password } = req.body;

  const user = users.find(u => u.username === username);
  if (!user) return res.json({ msg: "Create account first" });

  if (!bcrypt.compareSync(password, user.password)) {
    return res.json({ msg: "Wrong password" });
  }

  const token = jwt.sign({ username }, SECRET);
  res.json({ token });
});

/* ================= UPLOAD (ENCRYPTED FILE RECEIVED) ================= */
app.post('/api/upload', auth, upload.array('files'), (req, res) => {
  const files = readJSON('files.json');

  req.files.forEach(f => {
    const filename = Date.now() + "-" + f.originalname;

    fs.writeFileSync(path.join('uploads', filename), f.buffer);

    files.push({
      owner: req.user.username,
      filename
    });
  });

  writeJSON('files.json', files);
  res.json({ msg: "Uploaded" });
});

/* ================= GET FILES ================= */
app.get('/api/files', auth, (req, res) => {
  const files = readJSON('files.json');
  const shares = readJSON('shares.json');

  const myFiles = files
    .filter(f => f.owner === req.user.username)
    .map(f => f.filename);

  const shared = shares
    .filter(s => s.to === req.user.username)
    .map(s => s.filename);

  res.json({ files: myFiles, shared });
});

/* ================= DOWNLOAD ================= */
app.get('/api/download/:name', (req, res) => {
  const token = req.query.token;

  try {
    jwt.verify(token, SECRET);
    res.download(path.join('uploads', req.params.name));
  } catch {
    res.sendStatus(403);
  }
});

/* ================= DELETE ================= */
app.delete('/api/delete/:name', auth, (req, res) => {
  let files = readJSON('files.json');

  const file = files.find(f => f.filename === req.params.name);

  if (!file || file.owner !== req.user.username) {
    return res.sendStatus(403);
  }

  files = files.filter(f => f.filename !== req.params.name);
  writeJSON('files.json', files);

  fs.unlinkSync(path.join('uploads', req.params.name));

  res.json({ msg: "Deleted" });
});

/* ================= SHARE ================= */
app.post('/api/share', auth, (req, res) => {
  const { filename, toUser } = req.body;

  let shares = readJSON('shares.json');

  shares.push({
    from: req.user.username,
    to: toUser,
    filename
  });

  writeJSON('shares.json', shares);

  res.json({ msg: "Shared" });
});

/* ================= START ================= */
const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log("🚀 Running on port " + PORT);
});

const express = require("express");
const session = require("express-session");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 10000;

// ===== MIDDLEWARE =====
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(
  session({
    secret: "aurythos-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
  })
);

// ===== FILE UPLOAD (MEMORY SAFE) =====
const upload = multer({ storage: multer.memoryStorage() });

// ===== DATABASE (TEMP MEMORY) =====
let users = {};
let filesDB = {};

// ===== ENCRYPTION =====
function getKey(password) {
  return crypto.createHash("sha256").update(password).digest();
}

function encrypt(buffer, key) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  return Buffer.concat([iv, cipher.update(buffer), cipher.final()]);
}

function decrypt(buffer, key) {
  const iv = buffer.slice(0, 16);
  const data = buffer.slice(16);
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

// ===== AUTH =====
function auth(req, res, next) {
  if (!req.session.user || !req.session.key) {
    return res.redirect("/");
  }
  next();
}

// ===== HOME =====
app.get("/", (req, res) => {
  res.send(`
  <html>
  <style>
    body {
      background:#0f2027;
      display:flex;
      justify-content:center;
      align-items:center;
      height:100vh;
      font-family:sans-serif;
      color:white;
    }
    .box {
      background:#1c3b45;
      padding:25px;
      border-radius:12px;
      width:320px;
      box-shadow:0 0 20px rgba(0,0,0,0.5);
    }
    input,button {
      width:100%;
      padding:12px;
      margin:6px 0;
      border:none;
      border-radius:6px;
    }
    button {
      background:#00c6ff;
      color:black;
      font-weight:bold;
      cursor:pointer;
    }
  </style>
  <body>
    <div class="box">
      <h2>Aurythos Vault</h2>

      <form method="POST" action="/login">
        <input name="username" placeholder="Username" required />
        <input type="password" name="password" placeholder="Password" required />
        <button>Login</button>
      </form>

      <form method="POST" action="/register">
        <input name="username" placeholder="Username" required />
        <input type="password" name="password" placeholder="Password" required />
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

  if (users[username]) return res.send("User already exists");

  users[username] = {
    password: await bcrypt.hash(password, 10),
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

  if (!(await bcrypt.compare(password, user.password))) {
    return res.send("Wrong password");
  }

  req.session.user = username;
  req.session.key = getKey(password);

  res.redirect("/dashboard");
});

// ===== DASHBOARD =====
app.get("/dashboard", auth, (req, res) => {
  const username = req.session.user;
  const files = filesDB[username] || [];

  let list = files.length
    ? files.map((f, i) => `
      <div style="margin:10px 0;">
        📄 ${f.name}
        <a href="/download/${i}" style="color:#00c6ff;">Download</a>
      </div>
    `).join("")
    : "<p>No files uploaded</p>";

  res.send(`
  <html>
  <style>
    body {
      background:#0f2027;
      color:white;
      font-family:sans-serif;
      padding:20px;
    }
    .card {
      background:#1c3b45;
      padding:20px;
      border-radius:10px;
      max-width:400px;
      margin:auto;
    }
    input,button {
      width:100%;
      padding:10px;
      margin:5px 0;
    }
    button {
      background:#00c6ff;
      border:none;
      font-weight:bold;
    }
  </style>
  <body>

    <div class="card">
      <h2>Welcome ${username}</h2>

      <form method="POST" action="/upload" enctype="multipart/form-data">
        <input type="file" name="files" multiple required />
        <button>Upload Files</button>
      </form>

      <h3>Your Files</h3>
      ${list}

      <br/>
      <a href="/logout" style="color:red;">Logout</a>
    </div>

  </body>
  </html>
  `);
});

// ===== UPLOAD =====
app.post("/upload", auth, upload.array("files"), (req, res) => {
  try {
    const username = req.session.user;
    const key = req.session.key;

    if (!key) return res.send("Session expired. Login again.");

    if (!req.files || req.files.length === 0) {
      return res.send("No files selected");
    }

    if (!filesDB[username]) filesDB[username] = [];

    for (let file of req.files) {
      const encrypted = encrypt(file.buffer, key);

      filesDB[username].push({
        name: file.originalname,
        data: encrypted,
      });
    }

    res.redirect("/dashboard");

  } catch (err) {
    console.error(err);
    res.send("Upload failed");
  }
});

// ===== DOWNLOAD =====
app.get("/download/:id", auth, (req, res) => {
  const username = req.session.user;
  const key = req.session.key;

  const file = filesDB[username][req.params.id];

  if (!file) return res.send("File not found");

  const decrypted = decrypt(file.data, key);

  res.setHeader("Content-Disposition", `attachment; filename="${file.name}"`);
  res.send(decrypted);
});

// ===== LOGOUT =====
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

// ===== START =====
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});

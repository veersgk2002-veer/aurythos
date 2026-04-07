require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();

// ===== MIDDLEWARE =====
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use("/uploads", express.static("uploads"));

// ===== DATABASE =====
mongoose.connect(process.env.MONGO_URI)
.then(()=>console.log("MongoDB connected"))
.catch(err=>console.log(err));

// ===== USER MODEL =====
const userSchema = new mongoose.Schema({
  username: { type:String, unique:true },
  password: String
});
const User = mongoose.model("User", userSchema);

// ===== AUTH =====
function auth(req,res,next){
  const token = req.headers.authorization;
  if(!token) return res.sendStatus(403);

  try{
    const data = jwt.verify(token, "secret");
    req.user = data.username;
    next();
  }catch{
    res.sendStatus(403);
  }
}

// ===== STORAGE =====
const storage = multer.diskStorage({
  destination: (req,file,cb)=>{
    const dir = `uploads/${req.user}`;
    fs.mkdirSync(dir,{ recursive:true });
    cb(null, dir);
  },
  filename: (req,file,cb)=>{
    cb(null, Date.now()+"-"+file.originalname);
  }
});

const upload = multer({ storage });

// ===== ROUTES =====

// REGISTER
app.post("/api/register", async (req,res)=>{
  try{
    const hash = await bcrypt.hash(req.body.password,10);
    await User.create({ username:req.body.username, password:hash });
    res.json({ message:"User created" });
  }catch{
    res.json({ error:"User exists" });
  }
});

// LOGIN
app.post("/api/login", async (req,res)=>{
  const user = await User.findOne({ username:req.body.username });
  if(!user) return res.json({ error:"No user" });

  const ok = await bcrypt.compare(req.body.password, user.password);
  if(!ok) return res.json({ error:"Wrong password" });

  const token = jwt.sign({ username:user.username }, "secret");
  res.json({ token, username:user.username });
});

// UPLOAD MULTIPLE FILES
app.post("/api/upload", auth, upload.array("files"), (req,res)=>{
  res.json({ message:"Uploaded" });
});

// GET FILES
app.get("/api/files", auth, (req,res)=>{
  const dir = `uploads/${req.user}`;
  if(!fs.existsSync(dir)) return res.json([]);

  res.json(fs.readdirSync(dir));
});

// DELETE FILE
app.delete("/api/delete/:file", auth, (req,res)=>{
  const filePath = `uploads/${req.user}/${req.params.file}`;
  if(fs.existsSync(filePath)) fs.unlinkSync(filePath);
  res.json({ message:"Deleted" });
});

// SHARE FILE
app.post("/api/share", auth, (req,res)=>{
  const { file, toUser } = req.body;

  const from = `uploads/${req.user}/${file}`;
  const toDir = `uploads/${toUser}`;
  const to = `${toDir}/${file}`;

  if(!fs.existsSync(from)){
    return res.json({ error:"File not found" });
  }

  fs.mkdirSync(toDir,{ recursive:true });
  fs.copyFileSync(from,to);

  res.json({ message:"Shared" });
});

// ===== PAGES =====
app.get("/", (req,res)=>{
  res.sendFile(path.join(__dirname,"public/index.html"));
});

app.get("/vault", (req,res)=>{
  res.sendFile(path.join(__dirname,"public/vault.html"));
});

// ===== START =====
app.listen(4000, ()=>{
  console.log("Server running on 4000");
});

require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

// ===== DB =====
mongoose.connect(process.env.MONGO_URI)
.then(()=>console.log("MongoDB connected"))
.catch(err=>console.log(err));

// ===== MODELS =====
const User = mongoose.model("User", {
  username: { type: String, unique: true },
  password: String
});

const Share = mongoose.model("Share", {
  from: String,
  to: String,
  file: String
});

// ===== AUTH =====
function auth(req,res,next){
  const token = req.headers.authorization;
  if(!token) return res.send("No token");

  try{
    const data = jwt.verify(token,"secret123");
    req.user = data.username;
    next();
  }catch{
    res.send("Invalid token");
  }
}

// ===== STORAGE =====
const storage = multer.diskStorage({
  destination: function(req,file,cb){
    const dir = "uploads/" + req.user;
    if(!fs.existsSync(dir)) fs.mkdirSync(dir,{recursive:true});
    cb(null,dir);
  },
  filename: function(req,file,cb){
    cb(null, Date.now()+"-"+file.originalname);
  }
});
const upload = multer({ storage });

// ===== ROUTES =====
app.get("/",(req,res)=>{
  res.sendFile(path.join(__dirname,"public/index.html"));
});

app.get("/vault",(req,res)=>{
  res.sendFile(path.join(__dirname,"public/vault.html"));
});

// REGISTER
app.post("/api/register", async(req,res)=>{
  const {username,password} = req.body;

  const exist = await User.findOne({username});
  if(exist) return res.send("User exists");

  const hash = await bcrypt.hash(password,10);
  await User.create({username,password:hash});

  res.send("Registered");
});

// LOGIN
app.post("/api/login", async(req,res)=>{
  const {username,password} = req.body;

  const user = await User.findOne({username});
  if(!user) return res.send("No user");

  const ok = await bcrypt.compare(password,user.password);
  if(!ok) return res.send("Wrong password");

  const token = jwt.sign({username},"secret123");
  res.json({token});
});

// UPLOAD
app.post("/api/upload", auth, upload.array("files"), (req,res)=>{
  res.json({message:"Uploaded"});
});

// FILES
app.get("/api/files", auth, (req,res)=>{
  const dir = "uploads/" + req.user;
  if(!fs.existsSync(dir)) return res.json([]);
  res.json(fs.readdirSync(dir));
});

// DOWNLOAD
app.get("/api/download/:file", auth, (req,res)=>{
  const filePath = "uploads/" + req.user + "/" + req.params.file;
  if(!fs.existsSync(filePath)) return res.send("Not found");
  res.download(filePath);
});

// DELETE
app.delete("/api/delete/:file", auth, (req,res)=>{
  const filePath = "uploads/" + req.user + "/" + req.params.file;
  if(fs.existsSync(filePath)) fs.unlinkSync(filePath);
  res.send("Deleted");
});

// ===== SHARE =====
app.post("/api/share", auth, async(req,res)=>{
  const {file,to} = req.body;

  const user = await User.findOne({username:to});
  if(!user) return res.send("User not found");

  await Share.create({
    from:req.user,
    to,
    file
  });

  res.send("Shared");
});

app.get("/api/shared", auth, async(req,res)=>{
  const files = await Share.find({to:req.user});
  res.json(files);
});

app.listen(4000,()=>console.log("Server running"));

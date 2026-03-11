const express = require("express")
const cors = require("cors")
const multer = require("multer")
const fs = require("fs")
const path = require("path")
const jwt = require("jsonwebtoken")
const bcrypt = require("bcryptjs")
const crypto = require("crypto")

const app = express()

app.use(cors())
app.use(express.json())
app.use(express.static(path.join(__dirname,"public")))

const SECRET = "aurythos_secret_key"
const ENC_KEY = crypto.createHash("sha256").update("aurythos_file_key").digest()

if(!fs.existsSync("uploads")){
fs.mkdirSync("uploads")
}

if(!fs.existsSync("users.json")){
fs.writeFileSync("users.json","[]")
}

function loadUsers(){
return JSON.parse(fs.readFileSync("users.json"))
}

function saveUsers(users){
fs.writeFileSync("users.json",JSON.stringify(users,null,2))
}

function auth(req,res,next){

let token=req.headers.authorization

if(!token){
return res.status(401).json({error:"No token"})
}

token = token.replace("Bearer ","")

try{

const data=jwt.verify(token,SECRET)
req.user=data.email
next()

}catch{

res.status(401).json({error:"Invalid token"})

}

}

function encryptFile(input,output){

const iv = crypto.randomBytes(16)
const cipher = crypto.createCipheriv("aes-256-cbc",ENC_KEY,iv)

const inputStream = fs.createReadStream(input)
const outputStream = fs.createWriteStream(output)

outputStream.write(iv)

inputStream.pipe(cipher).pipe(outputStream)

}

function decryptFile(input,res){

const inputStream = fs.createReadStream(input)

let iv = Buffer.alloc(16)

inputStream.read(iv)

const decipher = crypto.createDecipheriv("aes-256-cbc",ENC_KEY,iv)

inputStream.pipe(decipher).pipe(res)

}

const storage = multer.diskStorage({

destination:function(req,file,cb){

const userFolder = path.join("uploads",req.user)

if(!fs.existsSync(userFolder)){
fs.mkdirSync(userFolder,{recursive:true})
}

cb(null,userFolder)

},

filename:function(req,file,cb){

const name = Date.now()+"-"+file.originalname
cb(null,name)

}

})

const upload = multer({storage:storage})

app.post("/register",async(req,res)=>{

const {email,password}=req.body

let users=loadUsers()

if(users.find(u=>u.email===email)){
return res.json({error:"User exists"})
}

const hash=await bcrypt.hash(password,10)

users.push({email,password:hash})

saveUsers(users)

const userFolder = path.join("uploads",email)

if(!fs.existsSync(userFolder)){
fs.mkdirSync(userFolder,{recursive:true})
}

res.json({status:"registered"})

})

app.post("/login",async(req,res)=>{

const {email,password}=req.body

const users=loadUsers()

const user=users.find(u=>u.email===email)

if(!user){
return res.json({error:"Invalid"})
}

const ok=await bcrypt.compare(password,user.password)

if(!ok){
return res.json({error:"Invalid"})
}

const token=jwt.sign({email},SECRET)

res.json({token})

})

app.post("/upload",auth,upload.single("file"),(req,res)=>{

const filePath=req.file.path
const encryptedPath=filePath+".enc"

encryptFile(filePath,encryptedPath)

setTimeout(()=>{
fs.unlinkSync(filePath)
},500)

res.json({status:"encrypted and stored"})

})

app.get("/files",auth,(req,res)=>{

try{

const userFolder = path.join("uploads",req.user)

if(!fs.existsSync(userFolder)){
return res.json({files:[]})
}

const files=fs.readdirSync(userFolder).filter(f=>f.endsWith(".enc"))

res.json({files})

}catch{

res.json({files:[]})

}

})

app.get("/download/:name",auth,(req,res)=>{

const file=path.join("uploads",req.user,req.params.name)

if(!fs.existsSync(file)){
return res.status(404).send("File not found")
}

decryptFile(file,res)

})

app.delete("/delete/:name",auth,(req,res)=>{

const file=path.join("uploads",req.user,req.params.name)

if(fs.existsSync(file)){
fs.unlinkSync(file)
}

res.json({status:"deleted"})

})

app.listen(3000,()=>{
console.log("Server running on http://localhost:3000")
})

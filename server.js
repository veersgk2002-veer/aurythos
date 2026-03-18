const express = require("express");
const session = require("express-session");
const fileUpload = require("express-fileupload");
const fs = require("fs");
const path = require("path");

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(fileUpload());
app.use("/uploads", express.static("uploads"));

app.use(session({
    secret: "vault-secret",
    resave: false,
    saveUninitialized: true
}));

if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");
if (!fs.existsSync("data")) fs.mkdirSync("data");

const USERS_FILE = "data/users.json";
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, "{}");

// ---------- HELPERS ----------

function getLimit(user){
    return user.plan === "pro" ? 1024*1024*1024 : 100*1024*1024;
}

function getUsage(user){
    let total = 0;
    user.files.forEach(f=>{
        let p = path.join("uploads", f);
        if(fs.existsSync(p)) total += fs.statSync(p).size;
    });
    return total;
}

// ---------- AUTH ----------

app.post("/register",(req,res)=>{
    let {username,password} = req.body;
    let users = JSON.parse(fs.readFileSync(USERS_FILE));

    if(users[username]) return res.send("User exists");

    users[username] = {password, files:[], shared:[], plan:"free"};
    fs.writeFileSync(USERS_FILE, JSON.stringify(users,null,2));

    req.session.user = username;
    res.redirect("/dashboard");
});

app.post("/login",(req,res)=>{
    let {username,password} = req.body;
    let users = JSON.parse(fs.readFileSync(USERS_FILE));

    if(!users[username] || users[username].password!==password)
        return res.send("Invalid login");

    req.session.user = username;
    res.redirect("/dashboard");
});

// ---------- DASHBOARD ----------

app.get("/dashboard",(req,res)=>{
    if(!req.session.user) return res.redirect("/");

    let users = JSON.parse(fs.readFileSync(USERS_FILE));
    let user = users[req.session.user];

    let usage = getUsage(user);
    let limit = getLimit(user);
    let percent = Math.min((usage/limit)*100,100);

    function preview(f){
        let ext = f.split(".").pop().toLowerCase();
        if(["jpg","jpeg","png","webp"].includes(ext)){
            return `<img src="/uploads/${f}" class="preview">`;
        }
        return "";
    }

    let filesHTML = user.files.map(f=>`
        <div class="file">
            ${preview(f)}
            <div class="info">
                <div class="name">${f}</div>

                <input id="u_${f}" placeholder="share username">

                <div class="btns">
                    <button onclick="share('${f}')">Share</button>
                    <button class="del" onclick="del('${f}')">Delete</button>
                    <a href="/download/${f}">
                        <button class="down">Download</button>
                    </a>
                </div>
            </div>
        </div>
    `).join("");

    let sharedHTML = user.shared.map(f=>`
        <div class="file">
            ${preview(f)}
            <div class="info">
                <div class="name">${f}</div>
                <a href="/download/${f}">
                    <button class="down">Download</button>
                </a>
            </div>
        </div>
    `).join("");

    res.send(`
    <html>
    <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">

    <style>
    body{
        margin:0;
        font-family:sans-serif;
        background: linear-gradient(135deg,#0f2027,#203a43,#2c5364);
        color:white;
    }

    .container{
        width:92%;
        margin:auto;
        padding:20px;
    }

    .box{
        background:rgba(255,255,255,0.08);
        padding:15px;
        border-radius:12px;
        margin-bottom:20px;
    }

    .progress{
        background:#222;
        border-radius:10px;
        overflow:hidden;
        margin-top:10px;
    }

    .bar{
        height:10px;
        background:#4facfe;
        width:${percent}%;
    }

    .file{
        display:flex;
        gap:10px;
        background:rgba(255,255,255,0.1);
        padding:10px;
        border-radius:10px;
        margin:10px 0;
    }

    .preview{
        width:70px;
        height:70px;
        object-fit:cover;
        border-radius:8px;
    }

    .name{
        font-size:12px;
        word-break:break-all;
    }

    input{
        padding:6px;
        border-radius:6px;
        border:none;
        margin-top:5px;
    }

    .btns{
        margin-top:5px;
    }

    button{
        background:#4facfe;
        border:none;
        padding:6px 10px;
        border-radius:6px;
        color:white;
        margin:2px;
    }

    .del{background:red;}
    .down{background:green;}
    </style>
    </head>

    <body>
    <div class="container">

        <div class="box">
            <b>Plan:</b> ${user.plan.toUpperCase()}<br>
            ${(usage/1024/1024).toFixed(2)} MB / ${(limit/1024/1024)} MB

            <div class="progress"><div class="bar"></div></div>

            ${user.plan==="free" ? `<br><a href="/upgrade"><button>Upgrade to Pro</button></a>` : ""}
        </div>

        <div class="box">
            <form action="/upload" method="post" enctype="multipart/form-data">
                <input type="file" name="file" multiple>
                <button>Upload</button>
            </form>
        </div>

        <div class="box"><h3>Your Files</h3>${filesHTML||"No files"}</div>

        <div class="box"><h3>Shared With You</h3>${sharedHTML||"No files"}</div>

        <a href="/logout">Logout</a>

    </div>

    <script>
    function del(f){
        fetch('/delete/'+f).then(()=>location.reload())
    }

    function share(f){
        let u=document.getElementById('u_'+f).value;
        fetch('/share',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({file:f,user:u})
        }).then(()=>location.reload())
    }
    </script>
    </body>
    </html>
    `);
});

// ---------- FILE ----------

app.post("/upload",(req,res)=>{
    if(!req.session.user) return res.redirect("/");

    let users = JSON.parse(fs.readFileSync(USERS_FILE));
    let user = users[req.session.user];

    let usage = getUsage(user);
    let limit = getLimit(user);

    let files = req.files.file;
    if(!Array.isArray(files)) files=[files];

    for(let f of files){
        if(usage+f.size>limit) return res.send("Limit exceeded");

        let name = Date.now()+"_"+f.name;
        f.mv("uploads/"+name);
        user.files.push(name);
        usage+=f.size;
    }

    fs.writeFileSync(USERS_FILE, JSON.stringify(users,null,2));
    res.redirect("/dashboard");
});

app.get("/download/:f",(req,res)=>{
    res.download("uploads/"+req.params.f);
});

app.get("/delete/:f",(req,res)=>{
    let users = JSON.parse(fs.readFileSync(USERS_FILE));
    let user = users[req.session.user];

    user.files = user.files.filter(x=>x!==req.params.f);
    fs.unlinkSync("uploads/"+req.params.f);

    fs.writeFileSync(USERS_FILE, JSON.stringify(users,null,2));
    res.redirect("/dashboard");
});

app.post("/share",(req,res)=>{
    let {file,user} = req.body;
    let users = JSON.parse(fs.readFileSync(USERS_FILE));

    if(!users[user]) return res.send("User not found");

    users[user].shared.push(file);
    fs.writeFileSync(USERS_FILE, JSON.stringify(users,null,2));

    res.send("ok");
});

// ---------- UPGRADE ----------

app.get("/upgrade",(req,res)=>{
    let users = JSON.parse(fs.readFileSync(USERS_FILE));
    users[req.session.user].plan="pro";

    fs.writeFileSync(USERS_FILE, JSON.stringify(users,null,2));
    res.redirect("/dashboard");
});

// ---------- LOGIN PAGE (PREMIUM TOGGLE) ----------

app.get("/",(req,res)=>{
    res.send(`
    <html>
    <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
    body{
        display:flex;
        justify-content:center;
        align-items:center;
        height:100vh;
        background: linear-gradient(135deg,#0f2027,#203a43,#2c5364);
        font-family:sans-serif;
    }
    .card{
        width:280px;
        padding:25px;
        background:rgba(255,255,255,0.1);
        border-radius:12px;
        text-align:center;
        color:white;
    }
    input{
        width:100%;
        margin:8px 0;
        padding:10px;
        border-radius:6px;
        border:none;
    }
    button{
        width:100%;
        padding:10px;
        background:#4facfe;
        border:none;
        color:white;
        border-radius:6px;
    }
    .toggle{
        margin-top:10px;
        font-size:13px;
        color:#ccc;
        cursor:pointer;
    }
    </style>
    </head>
    <body>

    <div class="card">
        <h3>Aurythos Vault</h3>

        <form id="form" method="post" action="/login">
            <input name="username" placeholder="Username">
            <input name="password" placeholder="Password">
            <button id="btn">Login</button>
        </form>

        <div class="toggle" onclick="toggle()">Switch to Register</div>
    </div>

    <script>
    let login=true;
    function toggle(){
        let f=document.getElementById("form");
        let b=document.getElementById("btn");
        let t=document.querySelector(".toggle");

        if(login){
            f.action="/register";
            b.innerText="Register";
            t.innerText="Switch to Login";
        }else{
            f.action="/login";
            b.innerText="Login";
            t.innerText="Switch to Register";
        }
        login=!login;
    }
    </script>

    </body>
    </html>
    `);
});

// ---------- LOGOUT ----------

app.get("/logout",(req,res)=>{
    req.session.destroy(()=>res.redirect("/"));
});

// ---------- SERVER ----------

const start = (p)=>{
    const s = app.listen(p,()=>console.log("Running on "+p));
    s.on("error",(e)=>{
        if(e.code==="EADDRINUSE") start(p+1);
    });
};

start(3000);

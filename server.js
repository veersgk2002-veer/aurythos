const express = require("express");
const multer = require("multer");
const fs = require("fs");
const bcrypt = require("bcryptjs");

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json());
app.use(express.static("public"));

// simple database (file)
let users = [];

if (fs.existsSync("users.json")) {
    users = JSON.parse(fs.readFileSync("users.json"));
}

// REGISTER
app.post("/register", async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.json({ success: false, message: "Missing fields" });
    }

    const exist = users.find(u => u.username === username);
    if (exist) {
        return res.json({ success: false, message: "User exists" });
    }

    const hashed = await bcrypt.hash(password, 10);

    users.push({ username, password: hashed });
    fs.writeFileSync("users.json", JSON.stringify(users));

    res.json({ success: true });
});

// LOGIN
app.post("/login", async (req, res) => {
    const { username, password } = req.body;

    const user = users.find(u => u.username === username);
    if (!user) {
        return res.json({ success: false, message: "User not found" });
    }

    const match = await bcrypt.compare(password, user.password);

    if (!match) {
        return res.json({ success: false, message: "Wrong password" });
    }

    res.json({ success: true });
});

// TEST
app.get("/test", (req, res) => {
    res.json({ message: "Server working ✅" });
});

app.listen(PORT, () => {
    console.log("Server running on port " + PORT);
});

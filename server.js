const express = require("express");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json());
app.use(express.static("public"));

// Load users
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

    const exists = users.find(u => u.username === username);
    if (exists) {
        return res.json({ success: false, message: "User exists" });
    }

    const hashed = await bcrypt.hash(password, 10);

    users.push({ username, password: hashed });
    fs.writeFileSync("users.json", JSON.stringify(users, null, 2));

    res.json({ success: true, message: "Registered" });
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

    res.json({ success: true, message: "Login success" });
});

// TEST
app.get("/test", (req, res) => {
    res.send("Server working");
});

app.listen(PORT, () => {
    console.log("Server running on port " + PORT);
});

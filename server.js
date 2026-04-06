const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 4000;

// create uploads folder if not exists
if (!fs.existsSync("uploads")) {
    fs.mkdirSync("uploads");
}

// multer setup
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, "uploads/");
    },
    filename: function (req, file, cb) {
        const uniqueName = Date.now() + "-" + file.originalname;
        cb(null, uniqueName);
    }
});

const upload = multer({ storage: storage });

// middleware
app.use(express.json());
app.use(express.static("public"));
app.use("/uploads", express.static("uploads"));

// test route
app.get("/test", (req, res) => {
    res.json({ message: "Server working ✅" });
});

// upload route
app.post("/upload", upload.single("file"), (req, res) => {
    if (!req.file) {
        return res.json({ success: false });
    }

    res.json({
        success: true,
        file: req.file.filename
    });
});

// start server
app.listen(PORT, () => {
    console.log("Server running on port " + PORT);
});

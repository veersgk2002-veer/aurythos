const express = require("express");
const multer = require("multer");
const { createClient } = require("@supabase/supabase-js");

const app = express();

/* ==============================
   SUPABASE CONFIG
============================== */

const SUPABASE_URL = "https://ybyljhalhkekelepceox.supabase.co";
const SUPABASE_KEY = "sb_publishable_piRhchIcAr95wRJ-D7eROQ_ITzRd36u";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/* ==============================
   MIDDLEWARE
============================== */

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ==============================
   FILE UPLOAD SETUP
============================== */

const storage = multer.memoryStorage();
const upload = multer({ storage });

/* ==============================
   HOME
============================== */

app.get("/", (req, res) => {
  res.send("Secure Vault Server Running");
});

/* ==============================
   UPLOAD FILE
============================== */

app.post("/upload", upload.single("file"), async (req, res) => {

  try {

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const file = req.file;
    const fileName = Date.now() + "-" + file.originalname;

    const { data, error } = await supabase.storage
      .from("vault-files")
      .upload(fileName, file.buffer, {
        contentType: file.mimetype
      });

    if (error) {
      return res.status(500).json(error);
    }

    res.json({
      message: "File uploaded successfully",
      file: data
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }

});

/* ==============================
   LIST FILES
============================== */

app.get("/files", async (req, res) => {

  try {

    const { data, error } = await supabase.storage
      .from("vault-files")
      .list("", { limit: 100 });

    if (error) {
      return res.status(500).json(error);
    }

    res.json({
      files: data
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }

});

/* ==============================
   DOWNLOAD FILE
============================== */

app.get("/download/:filename", async (req, res) => {

  try {

    const fileName = req.params.filename;

    const { data, error } = await supabase.storage
      .from("vault-files")
      .download(fileName);

    if (error) {
      return res.status(500).json(error);
    }

    const buffer = Buffer.from(await data.arrayBuffer());

    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.send(buffer);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }

});

/* ==============================
   SERVER
============================== */

const PORT = 3000;

app.listen(PORT, () => {
  console.log("Server running on http://localhost:3000");
});

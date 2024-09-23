const express = require("express");
const app = express();
const compression = require('compression');
const fs = require("fs");
const path = require("path");
const Firestore = require("@google-cloud/firestore");
const db = new Firestore({
  projectId: process.env.GCLOUD_PROJECT_ID,
    keyFilename: "/keyfile.json",
  });
const { randomInt } = require("crypto");

const port = 3000;
app.use(compression());

const footerPath = path.join(__dirname, "components", "footer.html");
const indexPath = path.join(__dirname, "views", "index.html");
const notFoundPath = path.join(__dirname, "views", "404.html");

app.use((req, res, next) => {
  res.set("Cache-Control", "no-cache, public");
  res.set("Content-Security-Policy", "default-src 'none'; script-src 'self' 'strict-dynamic' 'sha256-+WsLtgSAA4V5nkvNBFCUwS8SLpM5QoLyEkh1rP/64eo=' 'unsafe-inline' https: http:; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; require-trusted-types-for 'script';");
  res.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  res.set("X-Content-Type-Options", "nosniff");
  res.set("X-Frame-Options", "DENY");
  res.set("X-Xss-Protection", "0");
  res.set("Cross-Origin-Opener-Policy", "same-origin")
  res.set("Cross-Origin-Resource-Policy", "same-origin")
  res.removeHeader('X-Powered-By');
  next();
});

app.get("/data/poem/random", async (req, res) => {
  const number = randomInt(0,2);
  const snapshot = await db.collection("poems").where("index", "==", number).get();
  if (snapshot.empty) {
    return res.sendStatus(500);
  }  
  snapshot.forEach(doc => {
    let data = doc.data();
    data.id = doc.id;
    res.json(data);
  });
});


app.get("/data/poem/:id", async (req, res) => {
  const id = req.params.id;

  const doc = await db.collection("poems").doc(id).get();
  if (!doc.exists) {
    res.sendStatus(404);
  } else {
    let data = doc.data();
    data.id = doc.id;
    res.json(data);
  }
});

app.get("/", async (req, res) => {
  fs.readFile(indexPath, "utf-8", (err, indexData) => {
    if (err) {
      return res.sendStatus(500);
    }

    fs.readFile(footerPath, "utf-8", (err, footerData) => {
      if (err) {
        return res.sendStatus(500);
      }
  
      let modifiedHtml = indexData.replace("{{footer}}", footerData);
  
      res.send(modifiedHtml);
    });
  });
});

app.get("/favicon_16_dark.png", async (req, res) => {
  res.sendFile(path.join(__dirname, "public", "favicon_16_dark.png"));
});

app.get("/favicon_16_light.png", async (req, res) => {
  res.sendFile(path.join(__dirname, "public", "favicon_16_light.png"));
});

app.get("/build.css", async (req, res) => {
  res.sendFile(path.join(__dirname, "public", "build.css"));
});

app.use((req, res) => {
  fs.readFile(notFoundPath, "utf-8", (err, notFoundData) => {
    if (err) {
      return res.sendStatus(500);
    }

    fs.readFile(footerPath, "utf-8", (err, footerData) => {
      if (err) {
        return res.sendStatus(500);
      }

      let modifiedHtml = notFoundData.replace("{{footer}}", footerData);
  
      res.status(404).send(modifiedHtml);
    });
  });
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
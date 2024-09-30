const express = require("express");
const app = express();
const compression = require('compression');
const fs = require("fs");
const path = require("path");
const crypto = require('crypto');
const Firestore = require("@google-cloud/firestore");
const { Console } = require("console");
const db = new Firestore({
  projectId: process.env.GCLOUD_PROJECT_ID,
    keyFilename: "/keyfile.json",
  });

const port = 3000;
app.use(compression());

let footerData;
fs.readFile(path.join(__dirname, "components", "footer.html"), "utf-8", (err, data) => {
  if (err) throw err;
  footerData = data;
});

let navbarData;
fs.readFile(path.join(__dirname, "components", "navbar.html"), "utf-8", (err, data) => {
  if (err) throw err;
  navbarData = data;
});

let smallSnippetData;
fs.readFile(path.join(__dirname, "components", "small_snippet.html"), "utf-8", (err, data) => {
  if (err) throw err;
  smallSnippetData = data;
});

let searchResultData;
fs.readFile(path.join(__dirname, "components", "search_result.html"), "utf-8", (err, data) => {
  if (err) throw err;
  searchResultData = data;
});

let indexData;
fs.readFile(path.join(__dirname, "views", "index.html"), "utf-8", (err, data) => {
  if (err) throw err;
  indexData = data;
});

let poemData;
fs.readFile(path.join(__dirname, "views", "poem.html"), "utf-8", (err, data) => {
  if (err) throw err;
  poemData = data;
});

let authorData;
fs.readFile(path.join(__dirname, "views", "author.html"), "utf-8", (err, data) => {
  if (err) throw err;
  authorData = data;
});

let searchData;
fs.readFile(path.join(__dirname, "views", "search.html"), "utf-8", (err, data) => {
  if (err) throw err;
  searchData = data;
});

let notFoundData;
fs.readFile(path.join(__dirname, "views", "404.html"), "utf-8", (err, data) => {
  if (err) throw err;
  notFoundData = data;
});

function incrementReadCount(docId) {
  db.collection("poems").doc(docId).update({
    read_count: Firestore.FieldValue.increment(1)
  });
};

app.use((req, res, next) => {
  const nonce = crypto.randomBytes(16).toString('base64');
  res.locals.nonce = nonce;

  res.set("Cache-Control", "no-cache, public");
  res.set("Content-Security-Policy", `default-src 'none'; script-src 'self' 'strict-dynamic' 'unsafe-inline' 'nonce-${nonce}' https: http:; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; manifest-src 'self'; require-trusted-types-for 'script';`);
  res.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  res.set("X-Content-Type-Options", "nosniff");
  res.set("X-Frame-Options", "DENY");
  res.set("X-Xss-Protection", "0");
  res.set("Cross-Origin-Opener-Policy", "same-origin")
  res.set("Cross-Origin-Resource-Policy", "same-origin")
  res.removeHeader('X-Powered-By');
  next();
});

app.use(express.static(path.join(__dirname, "public")));

app.get("/data/poem/random", async (req, res) => {
  const query = req.query.ex || "";

  if (query !== "" && isNaN(query)) {
    console.log("Query parameter ex at /data/poem/random not a number");
    return res.sendStatus(400);
  }

  function number() {
    if (query === "") {
      return crypto.randomInt(0,3);
    } else {
      let randomNum;
      do {
        randomNum = crypto.randomInt(0,3);
      } while (randomNum === parseInt(query, 10));
      return randomNum;
    }
  };

  const index = number();
  const snapshot = await db.collection("poems").where("index", "==", index).limit(1).get();
  if (snapshot.empty) {
    console.log("Empty snapshot at /data/poem/random");
    return res.sendStatus(500);
  }  
  snapshot.forEach(doc => {
    const data = {
      author: doc.data().author,
      title: doc.data().title,
      poem: doc.data().poem.split('\n').slice(0, 13).join('\n'),
      index: doc.data().index,
      author_slug: doc.data().author_slug,
      title_slug: doc.data().title_slug
    };
    res.json(data);
  });
});

app.get("/:author/:title", async (req, res, next) => {
  const author = req.params.author;
  const title = req.params.title;

  const snapshot = await db.collection("poems").where("author_slug", "==", author).where("title_slug", "==", title).limit(1).get();
  if (snapshot.empty) {
    return next();
  }  
  snapshot.forEach(doc => {
    const data = doc.data();
  
    let modifiedHtml = poemData.replace("{{footer}}", footerData);
    modifiedHtml = modifiedHtml.replace(/{{title}}/g, data.title);
    modifiedHtml = modifiedHtml.replace(/{{author}}/g, data.author);
    modifiedHtml = modifiedHtml.replace("{{poem}}", data.poem.split('\n').map(line => line.trim() === '' ? '<br>' : `<p>${line}</p>`).join('\n'));
    modifiedHtml = modifiedHtml.replace("{{author_slug}}", data.author_slug);
    modifiedHtml = modifiedHtml.replace("{{navbar}}", navbarData);
    modifiedHtml = modifiedHtml.replace(/{{nonce}}/g, res.locals.nonce);
    
    res.send(modifiedHtml);

    incrementReadCount(doc.id);
  });
});

app.get("/", async (req, res) => {
  let modifiedHtml = indexData.replace("{{footer}}", footerData);
  modifiedHtml = modifiedHtml.replace("{{navbar}}", navbarData);
  modifiedHtml = modifiedHtml.replace(/{{nonce}}/g, res.locals.nonce);
  
  res.send(modifiedHtml);
});

app.get("/search", async (req, res) => {
  const query = req.query.q?.replace(/[^a-zA-Z0-9\s]/g, '').trim() || "";

  if (query.length > 100) {
    console.log("Search query is too long");
    return res.sendStatus(400);
  }

  let snapshot;
  if (query !== "") {
    const keywords = query.toLowerCase().split(' ');
    snapshot = await db.collection("poems").where("keywords", "array-contains-any", keywords).get();
  }
  
  let snippets = "";

  if (query == "") {
    snippets = "<p>Try searching for something</p>";
  } else if (snapshot.empty) {
    snippets = "<p>0 Results</p>";
  } else {
    snapshot.forEach(doc => {
      const data = doc.data();

      let snippet = searchResultData.replace("{{title}}", data.title);
      snippet = snippet.replace("{{poem}}", data.poem.split('\n').slice(0, 4).map(line => line.trim() === '' ? '<br>' : `<p>${line}</p>`).join('\n'));
      snippet = snippet.replace(/{{author_slug}}/g, data.author_slug);
      snippet = snippet.replace(/{{title_slug}}/g, data.title_slug);
      snippet = snippet.replace("{{author}}", data.author);
      snippets += snippet;
    });
  }

  let modifiedHtml = searchData.replace("{{footer}}", footerData);
  modifiedHtml = modifiedHtml.replace("{{snippets}}", snippets);
  modifiedHtml = modifiedHtml.replace("{{navbar}}", navbarData);
  modifiedHtml = modifiedHtml.replace("{{query}}", query)
  modifiedHtml = modifiedHtml.replace(/{{nonce}}/g, res.locals.nonce);

  res.send(modifiedHtml);
});

app.get("/:author", async (req, res, next) => {
  const authorParam = req.params.author;

  const snapshot = await db.collection("poems").where("author_slug", "==", authorParam).orderBy("read_count", "desc").get();
  if (snapshot.empty) {
    console.log("Empty snapshot at /:author");
    return next();
  }

  let snippets = "";
  let author = "";

  snapshot.forEach(doc => {
    const data = doc.data();

    author = data.author;
    let snippet = smallSnippetData.replace("{{title}}", data.title);
    snippet = snippet.replace("{{poem}}", data.poem.split('\n').slice(0, 4).map(line => line.trim() === '' ? '<br>' : `<p>${line}</p>`).join('\n'));
    snippet = snippet.replace(/{{author_slug}}/g, data.author_slug);
    snippet = snippet.replace(/{{title_slug}}/g, data.title_slug);
    snippets += snippet;
  });

  let modifiedHtml = authorData.replace("{{footer}}", footerData);
  modifiedHtml = modifiedHtml.replace(/{{author}}/g, author);
  modifiedHtml = modifiedHtml.replace("{{snippets}}", snippets);
  modifiedHtml = modifiedHtml.replace("{{navbar}}", navbarData);
  modifiedHtml = modifiedHtml.replace(/{{nonce}}/g, res.locals.nonce);
    
  res.send(modifiedHtml);
});

app.use((req, res) => {
  let modifiedHtml = notFoundData.replace("{{footer}}", footerData);
  modifiedHtml = modifiedHtml.replace("{{navbar}}", navbarData);
  modifiedHtml = modifiedHtml.replace(/{{nonce}}/g, res.locals.nonce);

  res.status(404).send(modifiedHtml);
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
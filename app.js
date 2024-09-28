const express = require("express");
const app = express();
const compression = require('compression');
const fs = require("fs");
const path = require("path");
const crypto = require('crypto');
const Firestore = require("@google-cloud/firestore");
const db = new Firestore({
  projectId: process.env.GCLOUD_PROJECT_ID,
    keyFilename: "/keyfile.json",
  });

const port = 3000;
app.use(compression());

const footerPath = path.join(__dirname, "components", "footer.html");
const navbarPath = path.join(__dirname, "components", "navbar.html");
const smallSnippetPath = path.join(__dirname, "components", "small_snippet.html");
const indexPath = path.join(__dirname, "views", "index.html");
const poemPath = path.join(__dirname, "views", "poem.html");
const authorPath = path.join(__dirname, "views", "author.html");
const searchPath = path.join(__dirname, "views", "search.html");
const notFoundPath = path.join(__dirname, "views", "404.html");

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
  const number = crypto.randomInt(0,2);
  const snapshot = await db.collection("poems").where("index", "==", number).limit(1).get();
  if (snapshot.empty) {
    console.log("Empty snapshot at /data/poem/random");
    return res.sendStatus(500);
  }  
  snapshot.forEach(doc => {
    let data = doc.data();
    const poem = data.poem.split('\n').slice(0, 13).join('\n');
    data.poem = poem
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
    fs.readFile(poemPath, "utf-8", (err, poemData) => {
      if (err) {
        console.log("Error reading poem.html");
        return res.sendStatus(500);
      }
  
      fs.readFile(footerPath, "utf-8", (err, footerData) => {
        if (err) {
          console.log("Error reading footer.html");
          return res.sendStatus(500);
        }

        fs.readFile(navbarPath, "utf-8", (err, navbarData) => {
          if (err) {
            console.log("Error reading navbar.html");
            return res.sendStatus(500);
          }

          const data = doc.data();
    
          let modifiedHtml = poemData.replace("{{footer}}", footerData);
          modifiedHtml = modifiedHtml.replace(/{{title}}/g, data.title);
          modifiedHtml = modifiedHtml.replace(/{{author}}/g, data.author);
          modifiedHtml = modifiedHtml.replace("{{poem}}", data.poem.split('\n').map(line => `<p>${line}</p>`).join('\n'));
          modifiedHtml = modifiedHtml.replace("{{author_slug}}", data.author_slug);
          modifiedHtml = modifiedHtml.replace("{{navbar}}", navbarData);
          modifiedHtml = modifiedHtml.replace(/{{nonce}}/g, res.locals.nonce);
      
          res.send(modifiedHtml);

          incrementReadCount(doc.id);
        });
      });
    });
  });
});

app.get("/", async (req, res) => {
  fs.readFile(indexPath, "utf-8", (err, indexData) => {
    if (err) {
      console.log("Error reading index.html");
      return res.sendStatus(500);
    }

    fs.readFile(footerPath, "utf-8", (err, footerData) => {
      if (err) {
        console.log("Error reading footer.html");
        return res.sendStatus(500);
      }

      fs.readFile(navbarPath, "utf-8", (err, navbarData) => {
        if (err) {
          console.log("Error reading navbar.html");
          return res.sendStatus(500);
        }
    
        let modifiedHtml = indexData.replace("{{footer}}", footerData);
        modifiedHtml = modifiedHtml.replace("{{navbar}}", navbarData);
        modifiedHtml = modifiedHtml.replace(/{{nonce}}/g, res.locals.nonce);
    
        res.send(modifiedHtml);
      });
    });
  });
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
  
  fs.readFile(searchPath, "utf-8", (err, searchData) => {
    if (err) {
      console.log("Error reading search.html");
      return res.sendStatus(500);
    }

    fs.readFile(footerPath, "utf-8", (err, footerData) => {
      if (err) {
        console.log("Error reading footer.html");
        return res.sendStatus(500);
      }

      fs.readFile(smallSnippetPath, "utf-8", (err, snippetData) => {
        if (err) {
          console.log("Error reading small_snippet.html");
          return res.sendStatus(500);
        }

        fs.readFile(navbarPath, "utf-8", (err, navbarData) => {
          if (err) {
            console.log("Error reading navbar.html");
            return res.sendStatus(500);
          }

          let snippets = "";

          if (query == "") {
            snippets = "<p>Try searching for something</p>";
          } else if (snapshot.empty) {
            snippets = "<p>0 Results</p>";
          } else {
            snapshot.forEach(doc => {
              const data = doc.data();
  
              let snippet = snippetData.replace("{{title}}", data.title);
              snippet = snippet.replace("{{poem}}", data.poem.split('\n').slice(0, 4).map(line => `<p>${line}</p>`).join('\n'));
              snippet = snippet.replace(/{{author_slug}}/g, data.author_slug);
              snippet = snippet.replace(/{{title_slug}}/g, data.title_slug);
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
      });
    });
  });
});

app.get("/:author", async (req, res, next) => {
  const author = req.params.author;

  const snapshot = await db.collection("poems").where("author_slug", "==", author).orderBy("read_count", "desc").get();
  if (snapshot.empty) {
    console.log("Empty snapshot at /:author");
    return next();
  }

  fs.readFile(authorPath, "utf-8", (err, authorData) => {
    if (err) {
      console.log("Error reading author.html");
      return res.sendStatus(500);
    }

    fs.readFile(footerPath, "utf-8", (err, footerData) => {
      if (err) {
        console.log("Error reading footer.html");
        return res.sendStatus(500);
      }

      fs.readFile(smallSnippetPath, "utf-8", (err, snippetData) => {
        if (err) {
          console.log("Error reading small_snippet.html");
          return res.sendStatus(500);
        }

        fs.readFile(navbarPath, "utf-8", (err, navbarData) => {
          if (err) {
            console.log("Error reading navbar.html");
            return res.sendStatus(500);
          }


          let snippets = "";
          let author = "";

          snapshot.forEach(doc => {
            const data = doc.data();

            author = data.author;
            let snippet = snippetData.replace("{{title}}", data.title);
            snippet = snippet.replace("{{poem}}", data.poem.split('\n').slice(0, 4).map(line => `<p>${line}</p>`).join('\n'));
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
      });
    });
  });
});

app.use((req, res) => {
  fs.readFile(notFoundPath, "utf-8", (err, notFoundData) => {
    if (err) {
      console.log("Error reading 404.html");
      return res.sendStatus(500);
    }

    fs.readFile(footerPath, "utf-8", (err, footerData) => {
      if (err) {
        console.log("Error reading footer.html");
        return res.sendStatus(500);
      }

      fs.readFile(navbarPath, "utf-8", (err, navbarData) => {
        if (err) {
          console.log("Error reading navbar.html");
          return res.sendStatus(500);
        }

        let modifiedHtml = notFoundData.replace("{{footer}}", footerData);
        modifiedHtml = modifiedHtml.replace("{{navbar}}", navbarData);
        modifiedHtml = modifiedHtml.replace(/{{nonce}}/g, res.locals.nonce);
  
        res.status(404).send(modifiedHtml);
      });
    });
  });
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
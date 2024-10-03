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

const footerData = fs.readFileSync(path.join(__dirname, "components", "footer.html"), "utf-8");
const navbarData = fs.readFileSync(path.join(__dirname, "components", "navbar.html"), "utf-8");
const smallSnippetData = fs.readFileSync(path.join(__dirname, "components", "small_snippet.html"), "utf-8");
const searchResultData = fs.readFileSync(path.join(__dirname, "components", "search_result.html"), "utf-8");
const headData = fs.readFileSync(path.join(__dirname, "components", "head.html"), "utf-8");

const indexData = fs.readFileSync(path.join(__dirname, "views", "index.html"), "utf-8").replace("{{footer}}", footerData).replace("{{navbar}}", navbarData).replace("{{head}}", headData);
const poemData = fs.readFileSync(path.join(__dirname, "views", "poem.html"), "utf-8").replace("{{footer}}", footerData).replace("{{navbar}}", navbarData).replace("{{head}}", headData);
const authorData = fs.readFileSync(path.join(__dirname, "views", "author.html"), "utf-8").replace("{{footer}}", footerData).replace("{{navbar}}", navbarData).replace("{{head}}", headData);
const searchData = fs.readFileSync(path.join(__dirname, "views", "search.html"), "utf-8").replace("{{footer}}", footerData).replace("{{navbar}}", navbarData).replace("{{head}}", headData);
const notFoundData = fs.readFileSync(path.join(__dirname, "views", "404.html"), "utf-8").replace("{{footer}}", footerData).replace("{{navbar}}", navbarData).replace("{{head}}", headData);

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
  res.set("Cross-Origin-Opener-Policy", "same-origin");
  res.set("Cross-Origin-Resource-Policy", "same-origin");
  res.set("Cross-Origin-Embedder-Policy", "require-corp");
  res.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.removeHeader('X-Powered-By');
  next();
});

app.use("/static", express.static(path.join(__dirname, "public")));

app.get("/data/poem/random", async (req, res) => {
  try {
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
  } catch (error) {
    console.log(error);
    res.sendStatus(500);
  }
  
});

app.get("/:author/:title", async (req, res, next) => {
  try {
    const author = req.params.author;
    const title = req.params.title;

    const snapshot = await db.collection("poems").where("author_slug", "==", author).where("title_slug", "==", title).limit(1).get();
    if (snapshot.empty) {
      return next();
    }  
    snapshot.forEach(doc => {
      const data = doc.data();
  
      let modifiedHtml = poemData.replace(/{{title}}/g, data.title);
      modifiedHtml = modifiedHtml.replace(/{{author}}/g, data.author);
      modifiedHtml = modifiedHtml.replace("{{poem}}", data.poem.split('\n').map(line => line.trim() === '' ? '<br>' : `<p>${line}</p>`).join('\n'));
      modifiedHtml = modifiedHtml.replace("{{author_slug}}", data.author_slug);
      modifiedHtml = modifiedHtml.replace(/{{nonce}}/g, res.locals.nonce);
    
      res.send(modifiedHtml);

      incrementReadCount(doc.id);
    });
  } catch (error) {
    console.log(error);
    res.sendStatus(500);
  }
  
});

app.get("/", async (req, res) => {
  try {
    let modifiedHtml = indexData.replace(/{{nonce}}/g, res.locals.nonce)
    res.send(modifiedHtml);
  } catch (error) {
    console.log(error);
    res.sendStatus(500);
  }
});

app.get("/search", async (req, res) => {
  try {
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

    let modifiedHtml = searchData.replace("{{snippets}}", snippets);
    modifiedHtml = modifiedHtml.replace("{{query}}", query)
    modifiedHtml = modifiedHtml.replace(/{{nonce}}/g, res.locals.nonce);

    res.send(modifiedHtml);
  } catch (error) {
    console.log(error);
    res.sendStatus(500);
  }
  
});

app.get("/:author", async (req, res, next) => {
  try {
    const authorParam = req.params.author;

    const snapshot = await db.collection("poems").where("author_slug", "==", authorParam).orderBy("read_count", "desc").get();
    if (snapshot.empty) {
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

    let modifiedHtml = authorData.replace(/{{author}}/g, author);
    modifiedHtml = modifiedHtml.replace("{{snippets}}", snippets);
    modifiedHtml = modifiedHtml.replace(/{{nonce}}/g, res.locals.nonce);
    
    res.send(modifiedHtml);
  } catch (error) {
    console.log(error);
    res.sendStatus(500);
  }
});

app.use((req, res) => {
  try {
    let modifiedHtml = notFoundData.replace(/{{nonce}}/g, res.locals.nonce);
    res.status(404).send(modifiedHtml);
  } catch (error) {
    console.log(error);
    res.sendStatus(500);
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
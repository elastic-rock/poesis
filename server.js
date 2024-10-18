const express = require("express");
const app = express();
const fs = require("fs");
const path = require("path");
const crypto = require('crypto');
const Firestore = require("@google-cloud/firestore");
const db = new Firestore();
const UAParser = require('ua-parser-js');

const port = process.env.PORT || 3000;

const poemCount = 3

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
const aboutData = fs.readFileSync(path.join(__dirname, "views", "about.html"), "utf-8").replace("{{footer}}", footerData).replace("{{navbar}}", navbarData).replace("{{head}}", headData);
const privacyData = fs.readFileSync(path.join(__dirname, "views", "privacy.html"), "utf-8").replace("{{footer}}", footerData).replace("{{navbar}}", navbarData).replace("{{head}}", headData);
const internalErrorData = fs.readFileSync(path.join(__dirname, "views", "500.html"), "utf-8").replace("{{footer}}", footerData).replace("{{navbar}}", navbarData).replace("{{head}}", headData);

function sendInternalError(req, res) {
  try {
    let modifiedHtml = internalErrorData.replace(/{{nonce}}/g, res.locals.nonce)
    res.status(500).send(modifiedHtml);
  } catch (error) {
    const log = {
      severity: "ERROR",
      "logging.googleapis.com/trace": req.header("X-Cloud-Trace-Context"),
      message: `Caught error at sendInternalError(): ${error}`
    }
    console.log(JSON.stringify(log));
    res.sendStatus(500);
  }
}

app.get('/_ah/warmup', async (req, res) => {
  try {
    await db.collection("poems").limit(1).get();
    res.sendStatus(200);
  } catch (error) {
    const log = {
      severity: "ERROR",
      "logging.googleapis.com/trace": req.header("X-Cloud-Trace-Context"),
      message: `Caught error at /_ah/warmup: ${error}`
    }
    console.log(JSON.stringify(log));
    res.sendStatus(500);
  }
});

app.get("/tasks/update-salt", async (req, res) => {
  try {
    console.log(req.header("X-Appengine-Cron"));
    if (req.header("X-Appengine-Cron") !== "true") {
      const log = {
        severity: "WARNING",
        "logging.googleapis.com/trace": req.header("X-Cloud-Trace-Context"),
        message: "Cron request could not be validated at /tasks/update-salt"
      }
      console.log(JSON.stringify(log));
      res.sendStatus(403);
      return
    }
    const salt = crypto.randomBytes(32).toString("hex");
    await db.collection("operation").doc("analytics").update({salt: salt});
    res.sendStatus(200);
    const log = {
      severity: "INFO",
      "logging.googleapis.com/trace": req.header("X-Cloud-Trace-Context"),
      message: "Analytics salt updated"
    }
    console.log(JSON.stringify(log));
  } catch (error) {
    const log = {
      severity: "ERROR",
      "logging.googleapis.com/trace": req.header("X-Cloud-Trace-Context"),
      message: `Caught error at /tasks/update-salt: ${error}`
    }
    console.log(JSON.stringify(log));
    res.sendStatus(500);
  }
});

app.use((req, res, next) => {
  try {
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
  } catch (error) {
    const log = {
      severity: "ERROR",
      "logging.googleapis.com/trace": req.header("X-Cloud-Trace-Context"),
      message: `Caught error at headers middleware: ${error}`
    }
    console.log(JSON.stringify(log));
    res.sendStatus(500);
  }
});

async function createAnalyticsEntry(req) {
  try {
    const requiredHeaders = (["X-Forwarded-For", "User-Agent"]);
    const missingHeaders = requiredHeaders.filter(header => !req.headers[header.toLowerCase()]);
    if (missingHeaders.length > 0) {
      const log = {
        severity: "INFO",
        "logging.googleapis.com/trace": req.header("X-Cloud-Trace-Context"),
        message: "Missing headers for analytics"
      }
      console.log(JSON.stringify(log));
      return
    }

    const userAgent = req.header("User-Agent")
    const parser = new UAParser(userAgent);
    const deviceInfo = parser.getResult();
    const userId = req.header("X-Forwarded-For") + req.header("User-Agent");

    await db.runTransaction(async (t) => {
      const operationData = await t.get(db.collection("operation").doc("analytics"));
      const salt = operationData.data().salt;
      const hash = crypto.createHmac("sha512", salt).update(userId).digest("hex");
      const entry = {
        country: req.header("X-Appengine-Country") || "ZZ",
        path: req.path,
        timestamp: Firestore.FieldValue.serverTimestamp(),
        userHash: hash,
        browserName: deviceInfo.browser.name,
        browserVersion: deviceInfo.browser.version,
        os: deviceInfo.os.name
      }
      if (req.header("Referer") !== undefined) {
        entry.referer = req.header("Referer")
      }

      await t.set(db.collection("analytics").doc(), entry);
    });
  } catch (error) {
    const log = {
      severity: "ERROR",
      "logging.googleapis.com/trace": req.header("X-Cloud-Trace-Context"),
      message: `Failed creating analytics entry: ${error}`
    }
    console.log(JSON.stringify(log));
  }
}

app.use(express.static(path.join(__dirname, "public")));

app.get("/data/poem/random", async (req, res) => {
  try {
    const ex = req.query.ex || "";
    const lang = req.query.lang || "";

    if (ex !== "" && isNaN(ex)) {
      const log = {
        severity: "INFO",
        "logging.googleapis.com/trace": req.header("X-Cloud-Trace-Context"),
        message: "Query parameter ex at /data/poem/random not a number"
      }
      console.log(JSON.stringify(log));
      return res.sendStatus(400);
    }

    const langSeparated = lang.split(',');
    if (lang !== "" && !langSeparated.every(q => /^[a-z]{2}$/.test(q))) {
      const log = {
        severity: "INFO",
        "logging.googleapis.com/trace": req.header("X-Cloud-Trace-Context"),
        message: "Query parameter lang at /data/poem/random violates regex"
      }
      console.log(JSON.stringify(log));
      return res.sendStatus(400);
    }

    function number() {
      if (ex === "") {
        return crypto.randomInt(0,poemCount);
      } else {
        let randomNum;
        do {
          randomNum = crypto.randomInt(0,poemCount);
        } while (randomNum === parseInt(ex, 10));
        return randomNum;
      }
    };

    const index = number();
    let snapshot;
    if (lang === "") {
      snapshot = await db.collection("poems").orderBy("index").startAt(index).limit(1).get();
    } else {
      snapshot = await db.collection("poems").where("language", "in", langSeparated).orderBy("index").startAt(index).limit(1).get();
    }

    if (snapshot.empty) {
      const log = {
        severity: "INFO",
        "logging.googleapis.com/trace": req.header("X-Cloud-Trace-Context"),
        message: "Empty snapshot at /data/poem/random"
      }
      console.log(JSON.stringify(log));
      return res.sendStatus(400);
    }  
    snapshot.forEach(doc => {
      const data = {
        author: doc.data().author,
        title: doc.data().title,
        poem: doc.data().poem.split('\n').slice(0, 13).join('\n'),
        index: doc.data().index,
        author_slug: doc.data().author_slug,
        title_slug: doc.data().title_slug,
        language: doc.data().language
      };
      res.json(data);
    });
  } catch (error) {
    const log = {
      severity: "ERROR",
      "logging.googleapis.com/trace": req.header("X-Cloud-Trace-Context"),
      message: `Caught error at /data/poem/random: ${error}`
    }
    console.log(JSON.stringify(log));
    res.sendStatus(500);
  }
  
});

app.get("/:author/:title", async (req, res, next) => {
  try {
    const author = req.params.author;
    const title = req.params.title;

    const snapshot = await db.collection("poems").where("author_slug", "==", author).where("title_slug", "==", title).limit(1).get();
    if (snapshot.empty) {
      const log = {
        severity: "INFO",
        "logging.googleapis.com/trace": req.header("X-Cloud-Trace-Context"),
        message: "Snapshot empty at /:author/:title"
      }
      console.log(JSON.stringify(log));
      return next();
    }  
    snapshot.forEach(doc => {
      const data = doc.data();
  
      let modifiedHtml = poemData.replace(/{{title}}/g, data.title);
      modifiedHtml = modifiedHtml.replace(/{{author}}/g, data.author);
      modifiedHtml = modifiedHtml.replace("{{poem}}", data.poem.split('\n').map(line => line.trim() === '' ? '<br>' : `<p>${line}</p>`).join('\n') + (data.copyright ? `<p class="font-light text-sm pt-4">Copyright: ${data.copyright}</p>` : ''));
      modifiedHtml = modifiedHtml.replace("{{author_slug}}", data.author_slug);
      modifiedHtml = modifiedHtml.replace("{{description}}", data.description);
      modifiedHtml = modifiedHtml.replace(/{{nonce}}/g, res.locals.nonce);
    
      res.send(modifiedHtml);
    });
  } catch (error) {
    const log = {
      severity: "ERROR",
      "logging.googleapis.com/trace": req.header("X-Cloud-Trace-Context"),
      message: `Caught error at /:author/:title: ${error}`
    }
    console.log(JSON.stringify(log));
    sendInternalError(req, res);
  }

  createAnalyticsEntry(req);
});

app.get("/", async (req, res) => {
  try {
    let modifiedHtml = indexData.replace(/{{nonce}}/g, res.locals.nonce)
    res.send(modifiedHtml);
  } catch (error) {
    const log = {
      severity: "ERROR",
      "logging.googleapis.com/trace": req.header("X-Cloud-Trace-Context"),
      message: `Caught error at /: ${error}`
    }
    console.log(JSON.stringify(log));
    sendInternalError(req, res);
  }

  createAnalyticsEntry(req);
});

app.get("/search", async (req, res) => {
  try {
    const query = req.query.q?.replace(/[^a-zA-Z0-9\s]/g, '').trim() || "";

    if (query.length > 100) {
      const log = {
        severity: "INFO",
        "logging.googleapis.com/trace": req.header("X-Cloud-Trace-Context"),
        message: "Query at /search too long"
      }
      console.log(JSON.stringify(log));
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
    const log = {
      severity: "ERROR",
      "logging.googleapis.com/trace": req.header("X-Cloud-Trace-Context"),
      message: `Caught error at /search: ${error}`
    }
    console.log(JSON.stringify(log));
    sendInternalError(req, res);
  }
  
  createAnalyticsEntry(req);
});

app.get("/about", async (req, res) => {
  try {
    let modifiedHtml = aboutData.replace(/{{nonce}}/g, res.locals.nonce)
    res.send(modifiedHtml);
  } catch (error) {
    const log = {
      severity: "ERROR",
      "logging.googleapis.com/trace": req.header("X-Cloud-Trace-Context"),
      message: `Caught error at /about: ${error}`
    }
    console.log(JSON.stringify(log));
    sendInternalError(req, res);
  }

  createAnalyticsEntry(req);
});

app.get("/privacy", async (req, res) => {
  try {
    let modifiedHtml = privacyData.replace(/{{nonce}}/g, res.locals.nonce)
    res.send(modifiedHtml);
  } catch (error) {
    const log = {
      severity: "ERROR",
      "logging.googleapis.com/trace": req.header("X-Cloud-Trace-Context"),
      message: `Caught error at /privacy: ${error}`
    }
    console.log(JSON.stringify(log));
    sendInternalError(req, res);
  }

  createAnalyticsEntry(req);
});

app.get("/:author", async (req, res, next) => {
  try {
    const authorParam = req.params.author;

    const snapshot = await db.collection("poems").where("author_slug", "==", authorParam).get();
    if (snapshot.empty) {
      const log = {
        severity: "INFO",
        "logging.googleapis.com/trace": req.header("X-Cloud-Trace-Context"),
        message: "Snapshot empty at /:author"
      }
      console.log(JSON.stringify(log));
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
    const log = {
      severity: "ERROR",
      "logging.googleapis.com/trace": req.header("X-Cloud-Trace-Context"),
      message: `Caught error at /:author: ${error}`
    }
    console.log(JSON.stringify(log));
    sendInternalError(req, res);
  }

  createAnalyticsEntry(req);
});

app.use((req, res) => {
  try {
    let modifiedHtml = notFoundData.replace(/{{nonce}}/g, res.locals.nonce);
    res.status(404).send(modifiedHtml);
  } catch (error) {
    const log = {
      severity: "ERROR",
      "logging.googleapis.com/trace": req.header("X-Cloud-Trace-Context"),
      message: `Caught error at 404 middleware: ${error}`
    }
    console.log(JSON.stringify(log));
    sendInternalError(req, res);
  }
});

app.listen(port, () => {
  const log = {
    severity: "INFO",
    message: `Server is running on http://localhost:${port}`
  }
  console.log(JSON.stringify(log));
});
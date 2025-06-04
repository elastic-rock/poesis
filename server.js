const express = require("express");
const app = express();
const fs = require("fs");
const crypto = require("crypto");
const path = require("path");
const { MongoClient, ObjectId } = require("mongodb");
const escape = require('escape-html');
const { JSDOM } = require("jsdom");

const client = new MongoClient(process.env.DB_URI);
const db = client.db("poesis");

const footerData = fs.readFileSync(path.join(__dirname, "components", "footer.html"), "utf-8");
const navbarData = fs.readFileSync(path.join(__dirname, "components", "navbar.html"), "utf-8");
const smallSnippetData = fs.readFileSync(path.join(__dirname, "components", "small_snippet.html"), "utf-8");
const searchResultData = fs.readFileSync(path.join(__dirname, "components", "search_result.html"), "utf-8");
const headData = fs.readFileSync(path.join(__dirname, "components", "head.html"), "utf-8");
const infoPairData = fs.readFileSync(path.join(__dirname, "components", "info_pairs.html"), "utf-8");
const licenseInfoData = fs.readFileSync(path.join(__dirname, "components", "license_info.html"), "utf-8");
const licenseInfoLinkData = fs.readFileSync(path.join(__dirname, "components", "license_info_link.html"), "utf-8");

const indexData = fs.readFileSync(path.join(__dirname, "views", "index.html"), "utf-8").replace("{{footer}}", footerData).replace("{{navbar}}", navbarData).replace("{{head}}", headData);
const poemData = fs.readFileSync(path.join(__dirname, "views", "poem.html"), "utf-8").replace("{{footer}}", footerData).replace("{{navbar}}", navbarData).replace("{{head}}", headData);
const authorData = fs.readFileSync(path.join(__dirname, "views", "author.html"), "utf-8").replace("{{footer}}", footerData).replace("{{navbar}}", navbarData).replace("{{head}}", headData);
const searchData = fs.readFileSync(path.join(__dirname, "views", "search.html"), "utf-8").replace("{{footer}}", footerData).replace("{{navbar}}", navbarData).replace("{{head}}", headData);
const notFoundData = fs.readFileSync(path.join(__dirname, "views", "404.html"), "utf-8").replace("{{footer}}", footerData).replace("{{navbar}}", navbarData).replace("{{head}}", headData);
const aboutData = fs.readFileSync(path.join(__dirname, "views", "about.html"), "utf-8").replace("{{footer}}", footerData).replace("{{navbar}}", navbarData).replace("{{head}}", headData);
const privacyData = fs.readFileSync(path.join(__dirname, "views", "privacy.html"), "utf-8").replace("{{footer}}", footerData).replace("{{navbar}}", navbarData).replace("{{head}}", headData);
const internalErrorData = fs.readFileSync(path.join(__dirname, "views", "500.html"), "utf-8").replace("{{footer}}", footerData).replace("{{navbar}}", navbarData).replace("{{head}}", headData);
const contactData = fs.readFileSync(path.join(__dirname, "views", "contact.html"), "utf-8").replace("{{footer}}", footerData).replace("{{navbar}}", navbarData).replace("{{head}}", headData);
const securityData = fs.readFileSync(path.join(__dirname, "views", "security.html"), "utf-8").replace("{{footer}}", footerData).replace("{{navbar}}", navbarData).replace("{{head}}", headData);
const licenseData = fs.readFileSync(path.join(__dirname, "views", "license.html"), "utf-8").replace("{{footer}}", footerData).replace("{{navbar}}", navbarData).replace("{{head}}", headData);
const contributeData = fs.readFileSync(path.join(__dirname, "views", "contribute.html"), "utf-8").replace("{{footer}}", footerData).replace("{{navbar}}", navbarData).replace("{{head}}", headData);

function sanitize(v) {
  if (v instanceof Object) {
    for (var key in v) {
      if (/^\$/.test(key)) {
        delete v[key];
      } else {
        sanitize(v[key]);
      }
    }
  }
  return v;
};

function generateCSPHash(scriptContent) {
    return `'sha256-${crypto.createHash('sha256').update(scriptContent, 'utf8').digest('base64')}'`;
}

function extractScriptsAndGenerateHashes(htmlContent) {
    const dom = new JSDOM(htmlContent);
    const scripts = [...dom.window.document.querySelectorAll('script:not([src])')];

    return scripts.map(script => generateCSPHash(script.textContent));
}

const hashes1 = extractScriptsAndGenerateHashes(navbarData);
const hashes2 = extractScriptsAndGenerateHashes(indexData);
const hashes3 = extractScriptsAndGenerateHashes(poemData);

const allHashes = [...new Set([...hashes1, ...hashes2, ...hashes3])];

app.use((req, res, next) => {
  try {  
    res.set("Cache-Control", "no-cache, public");
    res.set("Content-Security-Policy", `default-src 'none'; script-src 'self' 'strict-dynamic' 'unsafe-inline' ${allHashes.join(' ')} https: http:; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; manifest-src 'self'; require-trusted-types-for 'script';`);
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
    console.error(`Caught error at headers middleware: ${error}`);
    res.sendStatus(500);
  }
});

app.use(express.static(path.join(__dirname, "public")));

function sendInternalError(req, res) {
  try {
    res.status(500).send(internalErrorData);
  } catch (error) {
    console.error(`Caught error at sendInternalError(): ${error}`);
    res.sendStatus(500);
  }
}

app.get("/data/random-poem", async (req, res) => {
  try {
    const excludeId = req.query.excludeId;
    const language = req.query.language?.split(',');
    if (excludeId && !ObjectId.isValid(excludeId)) {
      return res.sendStatus(400);
    }
    if (language && !language.every(q => /^[a-z]{2}$/.test(q))) {
      return res.sendStatus(400);
    }
    
    let pipeline = [];
    if (excludeId) {
      const objectId = new ObjectId(excludeId);
      pipeline.push({ $match: { _id: { $ne: objectId } } });
    }
    if (language) {
      pipeline.push({ $match: { language: { $in: language } } });
    }
    pipeline.push({ $sample: { size: 1 } });
    
    const data = await db.collection("poems").aggregate(pipeline).toArray();
    if (data.length === 0) {
      res.sendStatus(404);
    } else {
      res.json(data[0]);
    }
  } catch (error) {
    console.error(`Caught error at /data/random-poem: ${error}`);
    res.sendStatus(500);
  }
});

app.get("/:author/poem/:title", async (req, res, next) => {
  try {
    const author = req.params.author;
    const poem = req.params.title;
    if (author && !/^[a-z\-]+$/.test(author)) {
      return next();
    }
    if (poem && !/^[a-z0-9-]+$/.test(poem)) {
      return next();
    }
    
    const query = { "author.slug": author, slug: poem };
    
    const data = await db.collection("poems").findOne(query);
    if (data === null) {
      return next();
    }
    
    let infoPairs = "";
    if (data.published) {
      infoPairs += infoPairData.replace("{{heading}}", "Published").replace("{{content}}", data.published);
    }

    let licenseInfo = "";
    licenseInfo = licenseInfoData.replace("{{license_info}}", "This poem is sourced{{adapted}} from {{source}}\nLicensed under {{license}}")
    if (data.source.license === "CC BY-SA 4.0") {
      licenseInfo = licenseInfo.replace("{{license}}", licenseInfoLinkData.replace("{{href}}", "https://creativecommons.org/licenses/by-sa/4.0/").replace("{{text}}", "CC BY-SA 4.0"))
    }
    if (data.source.modified) {
      licenseInfo = licenseInfo.replace("{{adapted}}", " and adapted")
    } else {
      licenseInfo = licenseInfo.replace("{{adapted}}", "")
    }
    licenseInfo = licenseInfo.replace("{{source}}", licenseInfoLinkData.replace("{{href}}", data.source.link).replace("{{text}}", data.source.name))

    let modifiedHtml = poemData.replace(/{{title}}/g, data.title);
    modifiedHtml = modifiedHtml.replace(/{{author}}/g, data.author.name);
    modifiedHtml = modifiedHtml.replace("{{poem}}", data.lines.join('\n'));
    modifiedHtml = modifiedHtml.replace("{{author_slug}}", data.author.slug);
    modifiedHtml = modifiedHtml.replace("{{info_pairs}}", infoPairs);
    modifiedHtml = modifiedHtml.replace("{{license_info}}", licenseInfo);
    
    res.send(modifiedHtml);
  } catch (error) {
    console.error(`Caught error at /:author/poem:title: ${error}`);
    sendInternalError(req, res);
  }
});

app.get("/", async (req, res) => {
  try {
    res.send(indexData);
  } catch (error) {
    console.error(`Caught error at /: ${error}`);
    sendInternalError(req, res);
  }
});

app.get("/search", async (req, res) => {
  try {
    const unsafeSearch = req.query.q;
    const search = sanitize(unsafeSearch);
    
    const query = {
      $or: [
        { lines: { $elemMatch: { $regex: search, $options: "i" } } },
        { title: { $regex: search, $options: "i" } },
        { "author.name": { $regex: search, $options: "i" } }
      ]
    };
    
    let snippets = "";
    
    if (unsafeSearch) {
      const sort = { title: 1 };
      const data = await db.collection("poems").find(query).sort(sort).toArray();
      if (data.length === 0) {
        snippets = "<p>0 Results</p>";
      } else {
        data.forEach(result => {
          let snippet = searchResultData.replace("{{title}}", result.title);
          snippet = snippet.replace("{{poem}}", result.lines.slice(0, 4).join('\n'));
          snippet = snippet.replace(/{{author_slug}}/g, result.author.slug);
          snippet = snippet.replace(/{{title_slug}}/g, result.slug);
          snippet = snippet.replace("{{author}}", result.author.name);
          snippets += snippet;
        });
      }
    } else {
      snippets = "<p>You can search however you want. You can search by the poem title, its author, or you can also search for poems that include some words. So try it out, it doesn't bite!</p>";
    }
    
    let modifiedHtml = searchData.replace("{{snippets}}", snippets);
    if (unsafeSearch) {
      modifiedHtml = modifiedHtml.replace("{{heading}}", `Search results for "${escape(search)}"`);
    } else {
      modifiedHtml = modifiedHtml.replace("{{heading}}", "Try searching for something")
    }
    
    res.send(modifiedHtml);
  } catch (error) {
    console.error(`Caught error at /search: ${error}`);
    sendInternalError(req, res);
  }
});

app.get("/about", async (req, res) => {
  try {
    res.send(aboutData);
  } catch (error) {
    console.error(`Caught error at /about: ${error}`);
    sendInternalError(req, res);
  }
});

app.get("/privacy", async (req, res) => {
  try {
    res.send(privacyData);
  } catch (error) {
    console.error(`Caught error at /privacy: ${error}`);
    sendInternalError(req, res);
  }
});

app.get("/contact", async (req, res) => {
  try {
    res.send(contactData);
  } catch (error) {
    console.error(`Caught error at /contact: ${error}`);
    sendInternalError(req, res);
  }
});

app.get("/security", async (req, res) => {
  try {
    res.send(securityData);
  } catch (error) {
    console.error(`Caught error at /security: ${error}`);
    sendInternalError(req, res);
  }
});

app.get("/license", async (req, res) => {
  try {
    res.send(licenseData);
  } catch (error) {
    console.error(`Caught error at /license: ${error}`);
    sendInternalError(req, res);
  }
});

app.get("/contribute", async (req, res) => {
  try {
    res.send(contributeData);
  } catch (error) {
    console.error(`Caught error at /contribute: ${error}`);
    sendInternalError(req, res);
  }
});

app.get("/sitemap.xml", async (req, res) => {
  try {
    const hostname = "https://poesis.io"

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

    const poemSort = { "author.slug": 1, slug: 1 };
    const poemResult = await db.collection("poems").find({}, { "author.slug": 1, slug: 1, _id: 0 }).sort(poemSort).toArray();
    poemResult.forEach(data => {
      xml += `  <url>\n`;
      xml += `    <loc>${hostname}/${data.author.slug}/poem/${data.slug}</loc>\n`;
      xml += `  </url>\n`;
    });

    const authorSort = { slug: 1 };
    const authorResult = await db.collection("authors").find({}, { slug: 1, _id: 0 }).sort(authorSort).toArray();
    authorResult.forEach(data => {
      xml += `  <url>\n`;
      xml += `    <loc>${hostname}/${data.slug}</loc>\n`;
      xml += `  </url>\n`;
    });

    const staticPaths = ["/", "/about", "/contact", "/contribute", "/license", "/privacy", "/search", "/security"]
    staticPaths.forEach(path => {
      xml += `  <url>\n`;
      xml += `    <loc>${hostname}${path}</loc>\n`;
      xml += `  </url>\n`;
    });

    xml += `</urlset>\n`;

    res.type("application/xml");
    res.send(xml);
  } catch (error) {
    console.error(`Caught error at /sitemap.txt: ${error}`);
    sendInternalError(req, res);
  }
});

app.get("/:author", async (req, res, next) => {
  try {
    const author = req.params.author;
    if (author && !/^[a-z\-]+$/.test(author)) {
      return next();
    }
    
    const authorQuery = { slug: author };
    const authorResult = await db.collection("authors").findOne(authorQuery);
    if (authorResult === null) {
      return next();
    }
    
    const poemSort = { title: 1 };
    const poemQuery = { "author.slug": author };
    const poemResult = await db.collection("poems").find(poemQuery).sort(poemSort).toArray();
    if (poemResult.length === 0) {
      return next();
    }
    
    let snippets = "";
    poemResult.forEach(result => {
      let snippet = smallSnippetData.replace("{{title}}", result.title);
      snippet = snippet.replace("{{poem}}", result.lines.slice(0, 4).join('\n'));
      snippet = snippet.replace(/{{author_slug}}/g, result.author.slug);
      snippet = snippet.replace(/{{title_slug}}/g, result.slug);
      snippets += snippet;
    });
    
    let modifiedHtml = authorData.replace("{{snippets}}", snippets);
    if (authorResult.born && authorResult.died) {
      modifiedHtml = modifiedHtml.replace("{{range}}", ` (${authorResult.born}–${authorResult.died})`);
    } else {
      modifiedHtml = modifiedHtml.replace("{{range}}", "");
    }
    modifiedHtml = modifiedHtml.replace(/{{author}}/g, authorResult.name);
    
    res.send(modifiedHtml);
  } catch (error) {
    console.error(`Caught error at /:author: ${error}`);
    sendInternalError(req, res);
  }
});

app.use((req, res) => {
  try {
    res.status(404).send(notFoundData);
  } catch (error) {
    console.error(`Caught error at 404 middleware: ${error}`);
    sendInternalError(req, res);
  }
});

const port = 3000;
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
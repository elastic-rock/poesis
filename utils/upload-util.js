const fs = require("fs");
const path = require("path");
const Firestore = require("@google-cloud/firestore");
const db = new Firestore();

async function batchUpload() {
  const folderPath = "./queue"
  const files = fs.readdirSync(folderPath);
  const batch = db.batch();

  for (const file of files) {
    const filePath = path.join(folderPath, file);

    if (path.extname(file) === '.json') {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const documentData = JSON.parse(fileContent);

      const docRef = db.collection("poems").doc();
      batch.set(docRef, documentData);
      console.log(`Added document from file: ${file}`);
    }
  }

  await batch.commit();
};

batchUpload();
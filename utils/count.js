const Firestore = require("@google-cloud/firestore");
const db = new Firestore();

async function printCount() {
    const snapshot = await db.collection("poems").count().get();
    console.log(`There are ${snapshot.data().count} poems`);
}

printCount();
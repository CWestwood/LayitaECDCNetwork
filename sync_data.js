const admin = require('firebase-admin');
const axios = require('axios');
const dotenv = require('dotenv').config();

// Initialize Firebase using the secret from GitHub
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function sync() {
  const ASSET_UID = process.env.KOBO_ECDCNETWORK_UID;
  const url = `https://kobo.humanitarianresponse.info/api/v2/assets/aSw4XLs4jNHrGMP8gnZy8o/data.json`;
  console.log('Requesting data from URL:', url);
  try {
    const response = await axios.get(url, {
      headers: { 'Authorization': `Token ${process.env.KOBO_API_KEY}` }
    });

    const batch = db.batch();
    const records = response.data.results;
    const collectionRef = db.collection('kobo_data');
    // Fetch all existing document IDs in one go
    const existingDocsSnap = await collectionRef.where(admin.firestore.FieldPath.documentId(), 'in', records.map(r => r._id.toString()).slice(0, 10)).get();
    // Firestore 'in' queries are limited to 10, so chunk if needed
    let existingIds = existingDocsSnap.docs.map(doc => doc.id);
    if (records.length > 10) {
      for (let i = 10; i < records.length; i += 10) {
        const chunk = records.slice(i, i + 10);
        const snap = await collectionRef.where(admin.firestore.FieldPath.documentId(), 'in', chunk.map(r => r._id.toString())).get();
        existingIds = existingIds.concat(snap.docs.map(doc => doc.id));
      }
    }
    // Add only records not already in Firestore
    let newCount = 0;
    records.forEach(record => {
      const docId = record._id.toString();
      if (!existingIds.includes(docId)) {
        const docRef = collectionRef.doc(docId);
        batch.set(docRef, record, { merge: true });
        newCount++;
      }
    });
    if (newCount > 0) {
      await batch.commit();
      console.log(`Added ${newCount} new records.`);
    } else {
      console.log("No new records to add.");
    }
  } catch (e) {
    console.error("Sync Failed", e);
    process.exit(1);
  }
}

sync();
require('dotenv').config();
const admin = require('firebase-admin');

let serviceAccount;

if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  // GitHub Actions / CI
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
} else {
  // Local development
  serviceAccount = require('./serviceAccountKey.json');
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id
});

const db = admin.firestore();

/**
 * Fetches data from KoboToolbox and syncs to Firestore
 * @param {string} collectionName - Firestore collection to store data
 * @returns {Promise<Object>} Result object with success status and counts
 */
async function syncKoboToFirestore(collectionName = 'kobo_submissions') {
  try {
    // Fetch data from KoboToolbox
    const koboUrl = `https://eu.kobotoolbox.org/api/v2/assets/${process.env.KOBO_ECDCNETWORK_UID}/data.json?limit=1000`;
    const koboApiKey = process.env.KOBO_API_KEY?.trim();

    console.log('Fetching data from KoboToolbox...');
    
    
    const response = await fetch(koboUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Token ${koboApiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`KoboToolbox API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const submissions = data.results || [];

    console.log(`Retrieved ${submissions.length} submissions from KoboToolbox`);

    // Push data to Firestore
    const batch = db.batch();
    let count = 0;

    for (const submission of submissions) {
      // Use KoboToolbox submission ID as document ID
      const docId = submission._id ? submission._id.toString() : `submission_${Date.now()}_${count}`;
      const docRef = db.collection(collectionName).doc(docId);
      
      // Add metadata
      const dataToStore = {
        ...submission,
        syncedAt: admin.firestore.FieldValue.serverTimestamp(),
        source: 'kobotoolbox'
      };
      delete dataToStore.__version__;

      batch.set(docRef, dataToStore, { merge: true });
      count++;

      // Firestore batch has a limit of 500 operations
      if (count % 500 === 0) {
        await batch.commit();
        console.log(`Committed batch of ${count} documents`);
      }
    }

    // Commit remaining documents
    if (count % 500 !== 0) {
      await batch.commit();
    }

    console.log(`Successfully synced ${count} submissions to Firestore`);

    return {
      success: true,
      totalSubmissions: submissions.length,
      syncedCount: count,
      collection: collectionName
    };

  } catch (error) {
    console.error('Error syncing data:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Export the function
module.exports = { syncKoboToFirestore };

// Example usage (uncomment to run directly)
syncKoboToFirestore('kobo_submissions')
   .then(result => console.log('Sync result:', result))
   .catch(err => console.error('Sync failed:', err));
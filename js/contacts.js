import { firebaseConfig } from './firebase-config.js';

let db = null;
let initialized = false;

async function initFirebase() {
  if (initialized) return;
  const { initializeApp } = await import('https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js');
  const { getFirestore } = await import('https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js');
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  initialized = true;
}

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function normalizePhone(phone) {
  return phone.replace(/\D/g, '').slice(-10);
}

// Deterministic doc ID from email so repeat submissions merge without reads
function emailToDocId(email) {
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = ((hash << 5) - hash) + email.charCodeAt(i);
    hash |= 0;
  }
  return 'c_' + Math.abs(hash).toString(36) + '_' + email.replace(/[^a-z0-9]/g, '_');
}

// Add or merge a contact. Uses setDoc with merge so no read is needed.
// Same email always maps to the same document ID.
export async function addContact({ name, email, phone, source, volunteerRole, message, tags = [] }) {
  await initFirebase();
  const { doc, setDoc, arrayUnion, serverTimestamp } =
    await import('https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js');

  const normalizedEmail = normalizeEmail(email);
  const docId = emailToDocId(normalizedEmail);
  const contactRef = doc(db, 'contacts', docId);

  const activityEntry = {
    source,
    timestamp: new Date().toISOString(),
    ...(volunteerRole && { volunteerRole }),
    ...(message && { message })
  };

  const data = {
    name: name || '',
    email: normalizedEmail,
    sources: arrayUnion(source),
    status: 'new',
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
    activity: arrayUnion(activityEntry)
  };

  if (phone) data.phone = normalizePhone(phone);
  if (volunteerRole) {
    const roles = volunteerRole.split(', ').filter(Boolean);
    data.volunteer_roles = arrayUnion(...roles);
  }
  if (tags.length) data.tags = arrayUnion(...tags);

  await setDoc(contactRef, data, { merge: true });
  return { id: docId };
}

const [, , email] = process.argv;
const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

if (!email || !apiKey) {
  throw new Error("Email and NEXT_PUBLIC_FIREBASE_API_KEY are required.");
}

const response = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(apiKey)}`,
  {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ requestType: "PASSWORD_RESET", email }),
  },
);

if (!response.ok) {
  const result = await response.json();
  throw new Error(result.error?.message || "Unable to send password setup email.");
}

console.log(`Password setup email sent to ${email}.`);

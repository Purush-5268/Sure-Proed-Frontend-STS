const axios = require('axios');
const fs = require('fs');

async function test() {
  try {
    // We need to login to get a token, then test endpoints
    const loginRes = await axios.post('http://127.0.0.1:8000/api/auth/token/', {
      email: 'paidipillipurushotham@gmail.com',
      password: 'Temp@12345' // Default from earlier hints? Or I can just check the backend DB with a quick script
    });
    console.log("Logged in!");
  } catch (err) {
    console.error("Login failed:", err.message);
  }
}
test();

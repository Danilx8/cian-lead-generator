import io from 'socket.io-client';

const serverUrl = 'https://1a17b7e3fe0e.ngrok-free.app/messages';
const jwtToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsImlhdCI6MTc1NTg4ODk5OCwiZXhwIjoxNzU1OTc1Mzk4fQ.cXi_IH4eP6c11naDmPuPNSqd5jm9nwFGeFk0AS6E3rs';

const socket = io(serverUrl, {
  transports: ['websocket', 'polling'],
  extraHeaders: { Authorization: jwtToken, "ngrok-skip-browser-warning": "true" }
});

socket.on('connect', () => {
  console.log('Connected, socket ID:', socket.id);
  socket.emit('join', 1);
});

socket.on('message', (data) => {
  console.log('New message:', data);
});

socket.on('error', (error) => {
  console.error('Server error:', error);
});

socket.on('connect_error', (error) => {
  console.error('Connection error:', error.message);
});

socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);
});
import { io } from 'socket.io-client';

const socket = io('/', { transports: ['websocket', 'polling'] });

socket.on('connect', ()    => console.log('[Socket] Connected'));
socket.on('disconnect', () => console.log('[Socket] Disconnected'));

export default socket;

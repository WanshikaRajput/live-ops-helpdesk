const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
// Production mein
const ALLOWED_ORIGIN = process.env.CLIENT_URL || "http://localhost:5173";
app.use(cors({ origin: ALLOWED_ORIGIN }));
app.use(express.static("public"));
app.get("/", (req, res) => res.send("Live Ops Helpdesk server running"));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: ALLOWED_ORIGIN, methods: ["GET", "POST"] },
});


const locks = new Map();

const lockList = () =>
  Object.fromEntries([...locks].map(([id, v]) => [id, { agentName: v.agentName }]));

io.on("connection", (socket) => {
  console.log("connected:", socket.id);

 
  socket.on("join_dashboard", ({ agentName }) => {
    socket.data.agentName = agentName;
    socket.emit("locks_state", lockList());
  });

  // 2. Lock request
  socket.on("lock_ticket", ({ ticketId }) => {
    const existing = locks.get(ticketId);
    if (existing && existing.socketId !== socket.id) {
      socket.emit("lock_rejected", { ticketId, lockedBy: existing.agentName });
      return;
    }
    const agentName = socket.data.agentName || "Unknown";
    locks.set(ticketId, { socketId: socket.id, agentName });
    io.emit("ticket_locked", { ticketId, agentName, socketId: socket.id });
  });

  
  socket.on("unlock_ticket", ({ ticketId }) => {
    const existing = locks.get(ticketId);
    if (existing && existing.socketId === socket.id) {
      locks.delete(ticketId);
      io.emit("ticket_unlocked", { ticketId });
    }
  });

 
  socket.on("disconnect", () => {
    console.log("disconnected:", socket.id);
    for (const [ticketId, lock] of locks) {
      if (lock.socketId === socket.id) {
        locks.delete(ticketId);
        io.emit("ticket_unlocked", { ticketId });
      }
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log("Server on port " + PORT));
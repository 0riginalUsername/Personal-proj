
import express from 'express'
import cors from 'cors'
import WebSocket, {WebSocketServer} from 'ws'
import {v4 as uuidv4} from 'uuid'
import session from 'express-session'
import handlerFunctions from './controller.js'
import ViteExpress from 'vite-express'
import {Room, User, Chat} from './model.js'
import {useSelector} from 'react-redux'
const {login, register, checkSession, deleteUser, editUser, getRooms, deleteRoom} = handlerFunctions


const app = express()

const port =  5555

app.use(cors())
app.use(session({secret: 'quiet', saveUninitialized: true, resave: false, cookie: {sameSite: false}}))
app.use(express.json())

app.get('/api/check', checkSession)
app.post('/api/auth', login)
app.post('/api/newuser', register)
app.post('/api/deleteuser', deleteUser)
app.post('/api/edit', editUser)
app.post('/api/getrooms', getRooms)
app.post('/api/deleteroom', deleteRoom)
const server = ViteExpress.listen(app, port, () => console.log(`Server running on http://localhost:${port}`))
const wss = new WebSocketServer({ server: server, path: '/api/ws' })

function makeId() {
  
  let result = '';
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const charactersLength = characters.length;
  let counter = 0;
  while (counter < 6) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
    counter += 1;
  }
  return result;
}
const getClients = async (roomKey) => {
  // console.log(roomKey);
  
  const foundRoom = await Room.findOne({
    where: {roomKey: roomKey},
    include: {model:User}

})
  let list = foundRoom.users.map((user) => user)
  
  return list
  
}




// HTTP connections
// app.get('/', (req, res) => {
//   res.send('Hello World!')
// })

// WebSocket connections
const clients = {}
let globalRooms = {}

// {
//   asdknazroq234r6: {
//     // room info
//   },
//   aiwenigfdfxuznlivx21324580albie: {

//   }
// }


wss.on('connection', (ws) => {
  console.log('Client connected')
  const id = uuidv4()

  // const message = JSON.parse(ws)
  clients[id] = ws
  // console.log(message);


  
  ws.on('error', console.error)

  ws.on('message', async (data) => {
    
      //  const message = isBinary? JSON.parse(data):data
      
      const message = JSON.parse(data)
      if (message.msg) {
        console.log(`Received message ${message.msg.username} said=>`, message.msg.message);
        let username = message.msg.username;
        let roomKey = message.msg.roomKey;
        const foundRoom = await Room.findOne({
          where: { roomKey: roomKey },
        });
        if (foundRoom) {
          let newChat = await Chat.create({
            message: message.msg.message,
            roomId: foundRoom.roomId,
            username: username, // Provide the username value
          });
          foundRoom.addChat(newChat);
          let foundChat = await Chat.findAll({ where: { roomId: foundRoom.roomId } });

          console.log('Roomkey: ', foundChat);
          wss.clients.forEach((client) => {
            client.send(JSON.stringify({ msg: foundChat, username }));
          });
        } else {
          console.log('Room not found!');
        }
      }
        // console.dir(message, {depth: null})
        if (message.createRoom) {
            let {username, userId, name} = message.createRoom
            
            let roomKey = makeId()
             
            
            let room = {
                roomKey,
                name,
                host: userId,
                players: [username]
              }
            if(!name){
              room.name = `${username}'s room`
            }
              // write sequelize here
              const newRoom = await Room.create(room)
              const foundUser = await User.findOne({
                where: {username}
              })
              await newRoom.addUser(foundUser)
              let players = await newRoom.getUsers()
              newRoom.players = players
              // end sequelize stuff
              
              clients[id].send(JSON.stringify({newRoom}))
        // rooms.id= roomId
        // rooms.key = key
        // rooms.name = message.createRoom.name
        // rooms.usernames= usernames
        
        // console.log('room info: ',rooms);
        // console.log(`room created, entry key is:, ${key}, room creator is ${usernames[0]}`);
        
        if(!message.createRoom.username){
            console.log('room creation failed! no user found!');
            const data = {success: false}
            wss.clients.forEach((client) => {
                client.send(JSON.stringify(data))
              })
        }
        //   console.log(rooms.users.clients);
      // clients[id].send(JSON.stringify({roomId}))
    } else if (message.joinRoomReq) {
      if(!message.joinRoomReq.username){
        clients[id].send(JSON.stringify({connectFail:true}))
        return
      }


        // console.log(message.joinRoomReq.joinKey);
        console.log(globalRooms);
        let joinKey = message.joinRoomReq.joinKey
        let username = message.joinRoomReq.username
        let foundRoom = await Room.findOne({where:
          {roomKey: joinKey}})
        console.log(foundRoom);
        if(!foundRoom){
          clients[id].send(JSON.stringify({joinRoomSuccess:false}))
          return
        }
        if(foundRoom.roomKey === joinKey){
          const foundUser = await User.findOne({
            where: {username}
          })
          await foundRoom.addUser(foundUser)
          foundRoom.save()
          let allUsers = await getClients(joinKey)
          console.log('users found!:', allUsers);
          // let currentRoom = globalRooms[joinKey]
          console.log('joined room!');
          // currentRoom.usernames.push(username)
          let foundChat = await Chat.findAll({where: {roomId: foundRoom.roomId}})
          // wss.clients.forEach((client) => {
          //   client.send(JSON.stringify({joinRoomSuccess: true, joinKey, allUsers, messages: foundChat}))
          // })
          let currentRoom = await foundRoom.getUsers()
          clients[id].send(JSON.stringify({joinRoomSuccess: true, joinKey, currentRoom, messages: foundChat}))
        }
        
     
        else{console.log('wrong key stupid!');}
        
    }
    if(message.leaveRoom){
      let {userId, roomKey} = message.leaveRoom
      // console.log(userId, roomKey);
      let foundRoom = await Room.findOne({where:{roomKey}})
      let foundUser = await User.findByPk(userId)
      foundRoom.removeUser(foundUser)
      foundRoom.save()
      let newRoom = await foundRoom.getUsers()
      console.log(`user "${foundUser.username}" left room!`)
      console.log(newRoom);
      wss.clients.forEach((client) => {
        client.send(JSON.stringify({updatedRoom: newRoom}))
      });
    }
    //   const room = rooms[message.joinRoom.key]

    //   if (room) {
    //     room.users.push({user_id: id, name: 'Ammon'})

    //     for (const user in room.users) {
    //       clients[user].send(JSON.stringify({room}))
    //     }
    //   }
    // } 
    else if (message.users) {

    }

    

    
  })

  // console.log(JSON.stringify({message: 'Client connected'}))
  // console.log(JSON.pa({message: 'Client connected'}))

  // const clients = {1234: wsclient1, 34235: wsclient2}
  // wsclient1.send()
  // ws.send()
  ws.on('close', () => {
    console.log(`Client disconnected`)
    delete clients[id]
    
    for (const client in clients) {
      clients[client].send(JSON.stringify({message: `Client ${id} disconnected`}))
    }
  })

  // const clientIds = Object.keys(clients)
  for (const client in clients) {
    clients[client].send(JSON.stringify({message: `Client ${id} connected`}))
  }
})


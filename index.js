const express = require('express');
const app = express()
const port = process.env.PORT || 5000
const { MongoClient, ServerApiVersion } = require('mongodb');

const cors = require('cors')
require('dotenv').config()


app.use(cors())
app.use(express.json())


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.lyeo0.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });


async function run() {
    try {
        //7
        await client.connect();
        const appointmentCollection = client.db("doctors_portal").collection("appointment");
        const bookingCollection = client.db("doctors_portal").collection("bookings");

        //8 load data 
        app.get('/appointment' , async(req,res) => {
            const query = {} 
            const cursor = appointmentCollection.find(query)
            const appointments = await cursor.toArray() 
            res.send(appointments)
        })

        // post 
        app.post('/booking' ,async(req,res) => {
            const booking = req.body 
            const result = await bookingCollection.insertOne(booking)
            res.send(result)
        })






    } finally {
        //   await client.close();
    }
}
run().catch(console.dir);




app.get('/', (req, res) => {
    res.send('Doctors server is running ')
})

app.listen(port, () => {
    console.log('Listenting on port ', port);
})
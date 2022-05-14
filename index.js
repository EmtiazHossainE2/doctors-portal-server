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
        app.get('/appointment', async (req, res) => {
            const query = {}
            const cursor = appointmentCollection.find(query)
            const appointments = await cursor.toArray()
            res.send(appointments)
        })

        // Warning: This is not the proper way to query multiple collection. 
        // After learning more about mongodb. use aggregate, lookup, pipeline, match, group
        
        // available 
        app.get('/available', async (req, res) => {
            const date = req.query.date 

            //1 get all appointments 
            const appointments = await appointmentCollection.find().toArray()

            //2 get booking that day 
            const query = { date: date };
            const bookings = await bookingCollection.find(query).toArray();

            //3 
            appointments.forEach(appointment => {
                const appointmentBooked = bookings.filter(b => b.treatment == appointment.name)
                const booked = appointmentBooked.map(a => a.slot)
                // appointment.booked = appointmentBooked.map(a => a.slot)
                const available = appointment.slots.filter(a => !booked.includes(a))
                appointment.slots = available
            })

            res.send(appointments)
        })

        // post 
        app.post('/booking', async (req, res) => {
            const booking = req.body
            const query = { treatment: booking.treatment, date: booking.date, patient: booking.patient }
            const exists = await bookingCollection.findOne(query)
            if (exists) {
                return res.send({ success: false, booking: exists })
            }
            else {
                const result = await bookingCollection.insertOne(booking)
                return res.send({ success: true, result });
            }
        })

        // get patient appointment 
        app.get('/booking' , async(req,res) => {
            const email = req.query?.patient
            const query = { email: email };
            const bookings = await bookingCollection.find(query).toArray();
            res.send(bookings)
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
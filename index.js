const express = require('express');
const jwt = require('jsonwebtoken');
const app = express()
const port = process.env.PORT || 5000
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const cors = require('cors')
require('dotenv').config()
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);


app.use(cors())
app.use(express.json())

//jwt 
const verifyJWT = (req, res, next) => {
    const authHeader = req.headers.authorization
    if (!authHeader) {
        return res.status(401).send({ message: 'Unauthorized Access' });
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
        if (err) {
            return res.status(403).send({ message: 'Forbidden Access' });
        }
        req.decoded = decoded;
        next();
    })
}


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.lyeo0.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });


async function run() {
    try {
        //7
        await client.connect();
        const appointmentCollection = client.db("doctors_portal").collection("appointment");
        const bookingCollection = client.db("doctors_portal").collection("bookings");
        const userCollection = client.db("doctors_portal").collection("users");
        const doctorCollection = client.db("doctors_portal").collection("doctors");
        const paymentCollection = client.db('doctors_portal').collection('payments');

        //verify admin middleware 
        const verifyAdmin = async (req, res, next) => {
            const requester = req.decoded.email
            const requesterAccount = await userCollection.findOne({ email: requester })
            if (requesterAccount.role === 'admin') {
                next()
            }
            else {
                res.status(403).send({ message: 'Forbidden Access' });
            }
        }

        //8 load data 
        app.get('/appointment', async (req, res) => {
            const query = {}
            const cursor = appointmentCollection.find(query).project({ name: 1 });
            const appointments = await cursor.toArray()
            res.send(appointments)
        })

        // users 
        app.get('/user', verifyJWT, async (req, res) => {
            const users = await userCollection.find().toArray()
            res.send(users)
        })

        //payment intent 2
        app.post('/create-payment-intent', verifyJWT, async(req, res) =>{
            const service = req.body;
            const price = service.price;
            const amount = price*100;
            const paymentIntent = await stripe.paymentIntents.create({
              amount : amount,
              currency: 'usd',
              payment_method_types:['card']
            });
            res.send({clientSecret: paymentIntent.client_secret})
          });



        
        //check admin
        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email
            const user = await userCollection.findOne({ email: email })
            const isAdmin = user?.role === 'admin'
            res.send({ admin: isAdmin })
        })


        //admin 
        app.put('/user/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email
            const filter = { email: email }
            const updateDoc = {
                $set: { role: 'admin' },
            };
            const result = await userCollection.updateOne(filter, updateDoc)
            res.send(result)
        })

        //user upsert 
        app.put('/user/:email', async (req, res) => {
            const email = req.params.email
            const filter = { email: email }
            const user = req.body
            const options = { upsert: true };
            const updateDoc = {
                $set: user
            };
            const result = await userCollection.updateOne(filter, updateDoc, options)
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN, { expiresIn: '1d' })
            res.send({ result, token })
        })

        // delete user
        app.delete('/user/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email
            const filter = {email : email}
            const result = await userCollection.deleteOne(filter)
            res.send(result)
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

        // get patient appointment (my appointments)
        app.get('/booking', verifyJWT, async (req, res) => {
            const email = req.query?.patient
            const decodedEmail = req.decoded.email
            if (email === decodedEmail) {
                const query = { email: email };
                const bookings = await bookingCollection.find(query).toArray();
                res.send(bookings)
            }
            else {
                return res.status(403).send({ message: 'Forbidden Access' });
            }
        })

        // booking id 
        app.get('/booking/:id' ,verifyJWT, async(req,res) => {
            const id = req.params.id 
            const query = {_id : ObjectId(id)} 
            const booking= await bookingCollection.findOne(query)
            res.send(booking)
        })

        //payment 3 
        app.patch('/booking/:id', verifyJWT, async(req, res) =>{
            const id  = req.params.id;
            const payment = req.body;
            const filter = {_id: ObjectId(id)};
            const updatedDoc = {
              $set: {
                paid: true,
                transactionId: payment.transactionId
              }
            }
      
            const result = await paymentCollection.insertOne(payment);
            const updatedBooking = await bookingCollection.updateOne(filter, updatedDoc);
            res.send(updatedBooking,result);
          })


        // doctor 
        //get all doctor 
        app.get('/doctor' ,verifyJWT,verifyAdmin, async(req,res) => {
            const doctors = await doctorCollection.find().toArray()
            res.send(doctors)
        })

        // add doctor
        app.post('/doctor', verifyJWT, verifyAdmin, async (req, res) => {
            const doctor = req.body
            const result = await doctorCollection.insertOne(doctor)
            res.send(result)
        })
        
        // delete doctor
        app.delete('/doctor/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email
            const filter = {email : email}
            const result = await doctorCollection.deleteOne(filter)
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
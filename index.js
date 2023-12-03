const express = require('express');
require('dotenv').config(); 
const cors = require('cors');
const jwt = require('jsonwebtoken')
// const cookieParser = require('cookie-parser')
// stripe sicrate key
const stripe = require("stripe")(process.env.STRIPE_SICRATE_KEY);
const app = express();
const port = process.env.PORT || 5000;

// midleWare
app.use(cors({
  origin: ['https://victorians-7ed75.web.app', 'http://localhost:5173'],
  credentials: true
}))
app.use(express.json());
// app.use(cookieParser());


// admin info/ admin info 
const uri = `mongodb+srv://${process.env.USER_NAME}:${process.env.PASSWORD}@cluster0.tpodeld.mongodb.net/?retryWrites=true&w=majority`;



const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});



async function run() {
  try {
    
    
    const contestCollaction = client.db('VictoriancDB').collection('contests');
    const userCollaction = client.db('VictoriancDB').collection('users');
    const bookingsCollaction = client.db('VictoriancDB').collection('bookings');
    const paymentsCollaction = client.db('VictoriancDB').collection('payments');
    

    // -------------------------------
          // jwt related apis
    // -------------------------------


    app.post('/jwt', async( req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
      
      // console.log(token);
      res.send({ token })
    })


    const verifyToken = (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).send({ message: 'unauthorized access' });
      }
      const token = req.headers.authorization.split(' ')[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: 'unauthorized access' })
        }
        req.decoded = decoded;
        next();
      })
    }


    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollaction.findOne(query);
      const isAdmin = user?.role === 'admin';
      if (!isAdmin) {
        return res.status(403).send({ message: 'forbidden access' });
      }
      next();
    }





    // -------------------------------
          // services related apis
    // -------------------------------




    // get all contest in a hook and distribute in all place for user ui
    app.get( '/getContests', async(req, res) => {
        const result = await contestCollaction.find().toArray();
        res.send(result)
    })
    
    // get one data for diteils in a hook and connact all contest cart
    app.get('/getDetailById/:id', async(req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id)}
        const result = await contestCollaction.findOne(query);
        res.send(result)
    })

    app.get( '/getSomeConset/:ids', verifyToken, async( req, res ) => {
      const ids = req.params.ids;
      console.log(ids);
    })

    // get all user in Users page and only for admins
    app.get('/getAllUsers', verifyToken, verifyAdmin, async(req, res) => {
      const result = await userCollaction.find().toArray();
      res.send(result)
    })

    // get all booking data for admins
    app.get('/getAllBookings', verifyToken, verifyAdmin, async(req, res) => {
      const result = await bookingsCollaction.find().toArray();
      res.send(result);
    })

    // get payment history for user by there emal
    app.get( '/getAllPayment', verifyToken, verifyAdmin,  async( req, res) => {
      const result = await paymentsCollaction.find().toArray();
      res.send(result)
    })

    // get user payments by there email
    app.get( '/getMyPayments/:email', verifyToken, async(req, res) => {
      const email = req.params.email;
      const query = { email: email};
      const result = await paymentsCollaction.find(query).toArray();
      res.send(result)
    })
    // get bookings detail for user by user id
    app.get('/getMyBookings', verifyToken, async( req, res )=> {
      const email = req.query.email;
      const query = { userEmail : email }
      const result = await bookingsCollaction.find(query).toArray();
      res.send(result)
    })

    // get admin for admin routs secure
    app.get('/getAdmin/:email', verifyToken, async(req, res) => {
      const email = req.params.email;

      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'forbidden access' })
      }

      const query = { email: email };
      const user = await userCollaction.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === 'admin';
      }
      res.send({ admin });
    })

    // store users data in database for admin functonality 
    app.post('/uploadeUser', async(req, res) => {
      const userDetails = req.body;
      const result = await userCollaction.insertOne(userDetails)
      res.send(result)
    })


    // uloade contest Booking data
    app.post('/uploadeBooking', verifyToken, async(req, res) => {
      const bookinDetails = req.body;
      const result = await bookingsCollaction.insertOne(bookinDetails);
      res.send(result)
    })

    // convart user to admin 
    app.patch('/makeAdmin/:id', verifyToken, verifyAdmin, async(req, res) => {
      const id = req.params.id;
      const query = { _id : new ObjectId(id)}
      const updateStateus = {
        $set: { role: 'admin'}
      }
      const result = await userCollaction.updateOne(query, updateStateus);
      res.send(result)
    })

    // delet user by only admin
    app.delete('/deletUser/:id', verifyToken, verifyAdmin, async(req, res) => {
      const id = req.params.id;
      const query = { _id : new ObjectId(id)};
      const result = await userCollaction.deleteOne(query);
      res.send(result)
    })


    // -------------------------------
          // payment related apis
    // -------------------------------



    // payment intent
    app.post('/create-paymetn-intent', verifyToken, async( req, res) => {
      const { price } = req.body;
      const amount = parseInt( price * 100);

      const paymentIntent  = await stripe.paymentIntents?.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ["card"]
      });

      res.send({
        clientSecret: paymentIntent.client_secret
      })
    })


    // post payment history with bokking ids and contest ids with some payment related information
    app.post('/post-pay-history', verifyToken, async( req, res ) => {
      const payment = req.body;
      const paymentResult = await paymentsCollaction.insertOne(payment);

      const query = {_id: {
        $in: payment.payedIds.map( id => new ObjectId(id))
      }}

      const deletResult = bookingsCollaction.deleteMany(query);

      res.send({paymentResult, deletResult})
    })

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log("Pinged your deployment. You successfully connected to MongoDB!");
} finally {  }
}
run().catch(console.dir);




app.get('/', (req, res) => {
    res.send('VICTORIANC server is running')
})

app.listen( port, () => {
    console.log(`bistro sit in ${port} port`);
})
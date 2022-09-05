import express from "express";
import cors from "cors";
import joi from "joi";
import dayjs from "dayjs";
import dotenv from "dotenv";
import { MongoClient, ObjectId } from "mongodb";

dotenv.config();

const mongoClient = new MongoClient(process.env.MONGO_URI);

let db;

mongoClient.connect().then(() => {
  db = mongoClient.db("batepapo");
});

const app = express();
app.use(express.json());
app.use(cors());

const nameSchema = joi.object({
  name: joi.string().required(),
});

app.get("/status", (req, res) => {
  res.send("ola");
});

app.post("/participants", async (req, res) => {
  const { name } = req.body;

  const { error, value } = nameSchema.validate({ name });
  {
    error ? res.sendStatus(422) : "";
  }

  try {
    const ans = await db.collection("participants").find({ name }).toArray();
    if (ans.length != 0) {
      return res.status(409).send("Nome já cadastrado");
    }
    const ansInsert = await db
      .collection("participants")
      .insertOne({ name, lastStatus: Date.now() });

    const resposta = await db.collection("messages").insertOne({
      from: name,
      to: "Todos",
      text: "entra na sala...",
      type: "status",
      time: dayjs().format("HH:mm:ss"),
    });
    return res.sendStatus(201);
  } catch (error) {
    res.sendStatus(500);
  }
});

app.get("/participants", async (req, res) => {
  try {
    const ans = await db.collection("participants").find({}).toArray();
    res.send(ans);
  } catch (error) {
    res.sendStatus(500);
  }
});

const postMessagesSchema = joi.object({
  to: joi.string().required(),
  text: joi.string().required(),
  type: joi.valid("message", "private_message").required(),
});

app.post("/messages", async (req, res) => {
  const body = req.body;
  const { user } = req.headers;

  try {
    let duplicate = await db
      .collection("participants")
      .find({ name: user })
      .toArray();
    if (duplicate.length == 0) {
      return res
        .status(422)
        .send("Esse nome não consta na lista de participantes");
    }
    let { error, value } = postMessagesSchema.validate(body, {
      abortEarly: false,
    });
    if (error) {
      return res.status(422).send(error.details.map((value) => value.message));
    }
    let corpo = { ...body, user, time: dayjs().format("HH:mm:ss") };
    await db.collection("messages").insertOne(corpo);
    res.sendStatus(201);
  } catch (error) {
    console.log(error);
    res.sendStatus(500);
  }
});

app.get("/messages", async (req, res) => {
  let messages = await db.collection("messages").find({}).toArray();

  const { limit } = req.query;
  const { user } = req.headers;

  messages = messages.filter(
    (value) =>
      value.user == user ||
      value.from == user ||
      value.to == user ||
      value.to == "Todos"
  );

  if (limit) {
    return res.send(messages.splice(-limit));
  }
  res.send(messages);
});

app.post("/status", async (req, res) => {
  const { user } = req.headers;
  let idTrocar, ansParticipant;
  if (user.length == 0) {
    res.sendStatus(404);
  }

  try {
    ansParticipant = await db
      .collection("participants")
      .findOne({ name: user });

    idTrocar = ansParticipant._id;
  } catch (erro) {
    return res.status(500).send(erro.message);
  }

  try {
    await db
      .collection("participants")
      .updateOne(
        { _id: ObjectId(idTrocar) },
        { $set: { ...ansParticipant, lastStatus: Date.now() } }
      );
    res.sendStatus(200);
  } catch (error) {
    return res.status(500).send(error.message);
  }
});

setInterval(async () => {
  const Participants = await db.collection("participants").find({}).toArray();

  Participants.forEach(async (element) => {
    if (Date.now() - element.lastStatus > 10000) {
      await db.collection("participants").deleteOne({ name: element.name });

      await db.collection("messages").insertOne({
        from: element.name,
        to: "Todos",
        text: "sai da sala...",
        type: "status",
        time: dayjs().format("HH:mm:ss"),
      });
    }
  });
}, 15000);

app.listen(5000, () => console.log("listening on 5000"));

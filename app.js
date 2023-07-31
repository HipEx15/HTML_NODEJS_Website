const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const bodyParser = require('body-parser');
const favicon = require('serve-favicon');
const cookieParser=require('cookie-parser');
var session=require('express-session');
var mysql = require('mysql');
const requestedIP = require('request-ip');


const app = express();
app.use(cookieParser());
app.use(session({
    secret: 'somesecret',
    saveUninitialized: false,
    resave: false,
    cookie: {
        maxAge: null
    }
  }));

const port = 6789; 

// directorul 'views' va conține fișierele .ejs (html + js executat la server)
app.set('view engine', 'ejs');
// suport pentru layout-uri - implicit fișierul care reprezintă template-ul site-ului este views/layout.ejs
app.use(expressLayouts);
// directorul 'public' va conține toate resursele accesibile direct de către client(e.g., fișiere css, javascript, imagini)
app.use('/public/', express.static('./public'));
// corpul mesajului poate fi interpretat ca json; datele de la formular se găsesc în format json în req.body
app.use(bodyParser.json());
// utilizarea unui algoritm de deep parsing care suportă obiecte în obiecte
app.use(bodyParser.urlencoded({ extended: true }));
// la accesarea din browser adresei http://localhost:6789/ se va returna textul 'Hello World'
// proprietățile obiectului Request - req - https://expressjs.com/en/api.html#req
// proprietățile obiectului Response - res - https://expressjs.com/en/api.html#res

function myMiddleware(req, res) 
{
    let IP_login = requestedIP.getClientIp(req);
    
    if(req.session.bannedIP != null)
    {
        if(req.session.bannedIP.includes(IP_login))
        {
            res.send("Resursele dorite sunt inexistente!");
            return true;
        }
    }
    return false;
  }

login_attempts = {};
banTime = {};

app.get('/', (req, res) => 
{
    myMiddleware(req, res);
    // în fișierul views/chestionar.ejs este accesibilă variabila 'intrebari' care conține vectorul de întrebări
    let utilizator = req.session.user;
    let bauturi = [];

    var mydatabase = mysql.createConnection({
        host: "localhost",
        user: "root",
        password: "password",
        database: "cumparaturi"
      });

    mydatabase.connect((err,database)=> 
    {
		if (err) 
        {
			console.log("Can't connect to database." + err.code);
			return;
		}
        console.log("Connected!");

        var sql = "SELECT * FROM cumparaturi.produse";
        mydatabase.query(sql,(err, result)=> 
        {
            if(err)
            {
				console.log("Can't get any data ! Error:  " + err.code);
			}
			else
            {
				result.forEach((rawDataPacket) => 
                {
                    bauturi.push(rawDataPacket);
                });

                if(utilizator)
                {
                    res.render('index', {user: req.cookies["user"], "bauturi": bauturi});
                }
                else
                {
                    res.render('index', {user: undefined, "bauturi": bauturi});
                }
			}
			return;
        });

    });
});

//Iconita site
app.use(favicon(__dirname + '/public/resources/favicon.ico'));

//Incarcarea JSON-ului pentru intrebari

const file = require('fs');
let questions = file.readFileSync('intrebari.json');
const questions_list = JSON.parse(questions);

// la accesarea din browser adresei http://localhost:6789/chestionar se va apela funcția specificată
app.get('/chestionar', (req, res) => 
{
    myMiddleware(req, res);

    // în fișierul views/chestionar.ejs este accesibilă variabila 'intrebari' care conține vectorul de întrebări
    let utilizator = req.session.user
	res.render('chestionar', {intrebari: questions_list, user:utilizator});

});

app.post('/rezultat-chestionar', (req, res) => 
{
    var response = req.body;
    var correctAnswer = 0;
    for(var index = 0; index < questions_list.length; index++)
    {
        var check_response = parseInt(response["intrebare." + index]);
        if(check_response == questions_list[index].corect)
        {
            correctAnswer++;
        } 
    }

    let utilizator = req.session.user;
    res.render('rezultat-chestionar', { good_response: correctAnswer, all_answers: questions_list.length, user:utilizator });
});


app.get('/autentificare', (req, res) => 
{    
    myMiddleware(req, res);

    var error = "";
    if(req.cookies["mesajEroare"] != null)
    {
        error = req.cookies["mesajEroare"];
    }

    IPLogin = requestedIP.getClientIp(req)
    if(IPLogin in banTime)
    {
      if(banTime[IPLogin] + 10000 > Date.now())
      {
        res.send("Logarea eșuată! Așteaptă 10 secunde!");
      }
      else
      {
        delete banTime[IPLogin]
        login_attempts[IPLogin] = 0
        req.cookies["mesajEroare"] = null;
      }  
    }

    res.clearCookie("mesajEroare");
    res.render('autentificare', {mesajEroare: error, user:null});
});

app.post('/verificare-autentificare', (req, res) => 
{

    let users = file.readFileSync('public/resources/utilizatori.json');
    const users_list = JSON.parse(users);

    var response = req.body;
    var user_login = response["user"];
    var user_password = response["password"];
    var user = null;

    //let utilizator = users_list.find((u) => u.utilizator === user_login && u.parola === user_password);

    users_list.forEach(index => {
        if(user_login == index.utilizator && user_password == index.parola){
            user = index;
            // parola nu trebuie trimisa
            delete user["parola"];
            return;
        }
    });

    //console.log(users_list);
    if (user != null) 
    {
        res.clearCookie('mesajEroare');
        req.session.user = user;
        res.cookie('user', user);
        res.redirect('/');
    } 
    else 
    {
        IPLogin = requestedIP.getClientIp(req)
        if(IPLogin in login_attempts)
        {
            login_attempts[IPLogin] = login_attempts[IPLogin] + 1
            if(login_attempts[IPLogin] > 5)
            {
                banTime[IPLogin] = Date.now()
            }
        }
        else
        {
            login_attempts[IPLogin] = 1;
        }
        res.cookie('mesajEroare', 'Nume sau parola gresite!', { maxAge: 1 * 86400 });
        res.redirect('/autentificare');
    }
});

app.get("/delogare", (req, res) => 
{    
    myMiddleware(req, res);

    if(req.session.user)
    {
        delete req.session.user;
    }
    res.clearCookie("mesajEroare");
    res.clearCookie("user");

    req.session.destroy();
    
    res.redirect("/");
})

app.get('/creare-bd', (req, res) => {

    let utilizator = req.session.user;

    if(utilizator)
    {
        var con = mysql.createConnection({
            host: 'localhost',
            user: 'root',
            password: 'password'
        });

        con.connect(function(err) {
            if (err) throw err;
            console.log("Connected!");
            con.query("CREATE DATABASE cumparaturi", function (err, result) {
                if (err)
                {
                    if(err.code == 'ER_DB_CREATE_EXISTS'){
                        console.log("Database already exists.");
                    }
                    else{
                        console.log(err.code);
                    }
                }
                console.log("Database created");
        });
        });

        var sql = "CREATE TABLE IF NOT EXISTS cumparaturi.produse (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, nume VARCHAR(255) NOT NULL, informatii VARCHAR(255) NOT NULL, pret INT UNSIGNED NOT NULL)";
        con.query(sql, function (err, result) {
            if (err)
            {
                if(err.code == 'ER_TABLE_EXISTS_ERROR'){
                    console.log("Table already exists.");
                }
                else{
                    console.log(err.code);
                }
            }
            console.log("Table created");
        });
    }

	res.redirect("admin");
});

var drinks = [
    ['LEMON LIME 355mL', '0 zahar | 200mg cofeina | 300mg electroliti', '20'],
    ['TROPICAL PUNCH 355mL', '0 zahar | 200mg cofeina | 300mg electroliti', '20'],
    ['BLUE RASPBERRY 355mL', '0 zahar | 200mg cofeina | 300mg electroliti', '20'],
    ['STRAWBERRY WATERMELON 355mL', '0 zahar | 200mg cofeina | 300mg electroliti', '20'],
    ['ORANGE MANGO 355mL', '0 zahar | 200mg cofeina | 300mg electroliti', '20'],
    ['STRAWBERRY WATERMELON 500mL', '0 zahar | 25 de calorii | 10% apa de cocos | electroliti', '30'],
    ['META MOON 500mL', '0 zahar | 25 de calorii | 10% apa de cocos | electroliti', '30'],
    ['ICE POP 500mL', '0 zahar | 25 de calorii | 10% apa de cocos | electroliti', '30'],
    ['BLUE RASPBERRY 500mL', '0 zahar | 25 de calorii | 10% apa de cocos | electroliti', '30'],
    ['ORANGE 500mL', '0 zahar | 25 de calorii | 10% apa de cocos | electroliti', '30'],
    ['TROPICAL PUNCH 500mL', '0 zahar | 25 de calorii | 10% apa de cocos | electroliti', '30'],
    ['LEMON LIME 500mL', '0 zahar | 25 de calorii | 10% apa de cocos | electroliti', '30'],
    ['GRAPE 500mL', '0 zahar | 25 de calorii | 10% apa de cocos | electroliti', '30'],
];

app.get('/inserare-bd', (req, res) => 
{
    let utilizator = req.session.user;

    if(utilizator)
    {
        var mydatabase = mysql.createConnection({
            host: "localhost",
            user: "root",
            password: "password",
            database: "cumparaturi"
        });
        
        mydatabase.connect((err,database)=> {
            if (err) {
                console.log("Can't connect to database." + err.code);
                return;
            }
            console.log("Connected!");

            var products = 0;
            mydatabase.query("SELECT COUNT(*) as AllValues FROM produse", function (err, result, fields) 
            {
                if (err) throw err;
                products = result[0]["AllValues"];

                //Testing

                /*if(products != 0)
                {
                    var sql = "DELETE FROM produse";
                    mydatabase.query(sql, function (err, result) {
                        if (err) throw err;
                        console.log("Table deleted");
                    });
                }*/

                if(products == 0)
                {
                    drinks.forEach(drink => {

                        var sql_insert = 'INSERT INTO cumparaturi.produse (id, nume, informatii, pret) VALUES (null, ?, ?, ?)';
                        mydatabase.query(sql_insert, [drink[0], drink[1], parseInt(drink[2])], function (err, result) {
                            if (err) throw err;
                            console.log("1 record inserted");
                        });
                        return;
                    });
                }

            });

        });
    }
	res.redirect("/");
});

//Code for testing DB

app.get('/delete-table', (req, res) => {

    let utilizator = req.session.user;

    if(utilizator)
    {
        var mydatabase = mysql.createConnection({
            host: "localhost",
            user: "root",
            password: "password",
            database: "cumparaturi"
        });
        
        mydatabase.connect(function(err) {
            if (err) throw err;
            var sql = "DELETE FROM produse";
            mydatabase.query(sql, function (err, result) {
            if (err) throw err;
                mydatabase.query("ALTER TABLE produse AUTO_INCREMENT = 1", function(err, result) {
                    if (err) throw err;
                })

            console.log("Table deleted");
            });
        });           
    }

    res.redirect("/");
});

//Back to dev

app.post('/adaugare-cos', (req, res) => 
{
    myMiddleware(req, res);

    let utilizator = req.session.user;

    if(utilizator)
    {
        var exists = false;

        //Initializare, in caz de este 0
        if(!req.session.cart)
        {
            req.session.cart = [];
        }
        
        // verific daca exista produsul in cos si actualizez cantitatea
        req.session.cart.forEach((index) => {
            if(index["id"] == req.body.id){
                index["cantitate"] = parseInt(index["cantitate"]) + parseInt(req.body.id_quanty);
                exists = true;
                return;
            }
        });

        //adaug produsul in cos
        if( exists === false)
        {
            req.session.cart.push(
                { 
                    id: req.body.id,
                    cantitate: req.body.id_quanty
                }
            );
        }
    }
    res.redirect("/");
});

app.get('/vizualizare-cos', (req, res) => 
{
    myMiddleware(req, res);

    var my_cart = [];
    let utilizator = req.session.user;

    if (req.session.cart) {
        my_cart = req.session.cart;
    }

    var mydatabase = mysql.createConnection({
        host: "localhost",
        user: "root",
        password: "password",
        database: "cumparaturi"
    });

    mydatabase.query("SELECT * FROM produse", function (err, result, fields) {
        result.forEach((allProducts) => {
            my_cart.forEach((product) => {
                if (product["id"] == allProducts["id"]) {
                    product["produs"] = allProducts;
                    return;
                }
            });
        });
        res.render('vizualizare-cos', { bauturi: my_cart, user: utilizator });
    });

    if (!my_cart.length) {
        res.render('vizualizare-cos', { bauturi: [], user: utilizator });
    }
});


app.get('/admin', (req, res) => 
{
    myMiddleware(req, res);

    if(!req.session.user)
    {
        res.redirect("/");
    }

    if(req.session.user['rol'] != "ADMIN")
    {
        res.redirect("/");
    }

    res.render('admin', {user: req.session.user});
});

app.post('/verificare-produs-nou', (req, res) =>
{

    var error = false;

    if(!req.session.user)
    {
        res.redirect("/");
    }

    if(req.session.user['rol'] != "ADMIN")
    {
        res.redirect("/");
    }

    var nume_bautura = req.body.nume;
    var informatii_bautura = req.body.info;
    var pret_bautura = parseInt(req.body.pret);

    if(nume_bautura == "" || informatii_bautura == "")
    {
        error = true;
    }

    if(!error)
    {
        var mydatabase = mysql.createConnection({
            host: "localhost",
            user: "root",
            password: "password",
            database: "cumparaturi"
        });
        
        mydatabase.connect(function(err) {
            if (err) throw err;
            var sql_insert = 'INSERT INTO cumparaturi.produse (id, nume, informatii, pret) VALUES (null, ?, ?, ?)';
            mydatabase.query(sql_insert, [nume_bautura, informatii_bautura, pret_bautura], function (err, result) {
            if (err) throw err;
            console.log("Record inserted");
            res.redirect("/");
            });
        });           
    }
    else
    {
        res.redirect('admin');
    }
});

app.use(function(req, res) 
{
    res.statusCode = 404;
    if (req.session.accessCounter == null) 
    {
        req.session.accessCounter = 1;
    } else 
    {
        req.session.accessCounter++;
    }

    if (req.session.accessCounter > 5) 
    {
        req.session.bannedIP = req.session.bannedIP || [];
        let clientIp = requestedIP.getClientIp(req);
        if (!req.session.bannedIP.includes(clientIp)) 
        {
            req.session.bannedIP.push(clientIp);
        }
    }
    res.status(404).send("Pagina nu a fost găsită!");
  });

app.listen(port, () => console.log(`Serverul rulează la adresa http://localhost:`));
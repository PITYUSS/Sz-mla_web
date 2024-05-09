if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config()
}

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const bodyParser = require('body-parser');
const passport = require('passport');
const flash = require('express-flash');
const session = require('express-session');
var LocalStrategy = require('passport-local');
var SQLiteStore = require('connect-sqlite3')(session);
const methodOverride = require('method-override');

const app = express();
const PORT = process.env.PORT || 3000;

passport.serializeUser(function(user, cb) {
  process.nextTick(function() {
    return cb(null, {
      id: user.UserID,
      username: user.UserName,
    });
  });
});

passport.deserializeUser(function(user, cb) {
  process.nextTick(function() {
    return cb(null, user);
  });
});

function checkAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next()
  }
  res.redirect('/login')
}

function checkNotAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return res.redirect('/billing')
  }
  next()
}

// Initialize SQLite database

const db = new sqlite3.Database('./database.db');
db.run('PRAGMA foreign_keys = ON');

passport.use(new LocalStrategy({
  usernameField: 'text',
  passwordField: 'password'
}, function verify(username, password, cb) {

  db.get('SELECT * FROM user WHERE UserName = ?', [username], function(err, user) {
    if (err) { return cb(err); }
    if (!user) { return cb(null, false, { message: 'Incorrect username or password.' }); }

    bcrypt.hash(password, user.PasswordSalt, function(err, hash) {
      if (err) {
        return cb(null, false, { message: 'Incorrect password.' });
      }
      if (hash == user.PasswordHash) {
        return cb(null, user);
      }
    })
  });
}));


// Middleware
/* app.use( express.static( "public" ) ) */
app.set('view-engine', 'ejs')
app.use(bodyParser.urlencoded({ extended: true }));
app.use(flash())
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: new SQLiteStore({ db: 'sessions.db', dir: '.' })
}))
app.use(passport.initialize());
app.use(passport.session());
app.use(methodOverride('_method'));

//logout
app.delete("/logout", (req, res) => {
  req.logout(function(err) {
    if (err) {
      res.status(500).send('Error logging out');
    } else {
      res.redirect("/");
    }
  });
});

// Serve static files
app.use(express.static(__dirname + '/public'));

// Routes checkNotAuthenticated

app.get('/login', checkNotAuthenticated, (req, res) => {
  res.render(__dirname + '/views/login.ejs');
});

app.get('/register', checkNotAuthenticated, (req, res) => {
  res.render(__dirname + '/views/register.ejs');
});

app.get('/', checkNotAuthenticated, (req, res) => {
  res.render(__dirname + '/views/index.ejs');
});

app.get('/contact', checkNotAuthenticated, (req, res) => {
  res.render(__dirname + '/views/contactUs.ejs');
});

app.get('/industries', checkNotAuthenticated, (req, res) => {
  res.render(__dirname + '/views/industries.ejs');
});

app.get('/Sales&Invoicing', checkNotAuthenticated, (req, res) => {
  res.render(__dirname + '/views/services.ejs');
});

app.get('/Accounting', checkNotAuthenticated, (req, res) => {
  res.render(__dirname + '/views/services2.ejs');
});

app.get('/Inventory', checkNotAuthenticated, (req, res) => {
  res.render(__dirname + '/views/services3.ejs');
});



// Routes checkAuthenticated

app.get('/bill', checkAuthenticated, (req, res) => {
  res.render(__dirname + '/views/bill.ejs');
});

app.get('/orders', checkAuthenticated, (req, res) => {
  res.render(__dirname + '/views/orders.ejs');
});

app.get('/inventory', checkAuthenticated, (req, res) => {
  res.render(__dirname + '/views/viewstocks.ejs');
});

app.get('/account', checkAuthenticated, (req, res) => {
  res.render(__dirname + '/views/account.ejs');
});

app.post('/login', checkNotAuthenticated, passport.authenticate('local', {
  successRedirect: '/billing',
  failureRedirect: '/login',
  failureFlash: true
}))

app.post('/register', checkNotAuthenticated, (req, res) => {
  const userName = req.body.text;
  const password = req.body.password;
  const password1 = req.body.password1;
  const email = req.body.email;
  const mobileNumber = req.body.phone;
  const headquarters = req.body.place;

  if (password !== password1) {
    return res.status(400).send('Passwords do not match!');
  }

  //hash
  bcrypt.genSalt(4, function(err, salt) {
    bcrypt.hash(password, salt, function(err, hash) {
      if (err) {
        console.log(err);
        return res.status(500).send('Internal Server Error');
      }
      const sql = 'INSERT INTO User (UserName, PasswordHash , PasswordSalt, Email, MobileNumber, Headquarters) VALUES (?, ? , ? , ?, ?, ?)';
      db.run(sql, [userName, hash, salt, email, mobileNumber, headquarters], (err) => {
        if (err) {
          console.log(err)
          return res.status(500).send('Registration failed. User may already exist.');
        }
        res.redirect("/login");
      });

    })
  })
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});


/* Bill making for bill.ejs */

app.post("/billing/create", checkAuthenticated, (req, res) => {
  let userId = req.user.id;
  let items = req.body.items;
  if (!items) {
    return res.status(400).send('Missing items');
  }
  let itemIdsLength = items.length;
  let string = "(";
  let ids = {};

  if (itemIdsLength === 0) {
    return res.status(500).send('No items to bill');
  }

  for (let i = 0; i < itemIdsLength; i++) {
    if (items[i].Quantity == "0") {
      return res.status(400).send('Item with 0 quantity cannot be billed.');
    }
    if (ids[items[i].ItemId]) {
      return res.status(400).send('Duplicate item ids');
    }
    ids[items[i].ItemId] = true;
  }

  for (let i = 0; i < itemIdsLength; i++) {
    string += "?";
    if (i < itemIdsLength - 1) {
      string += ",";
    }
  }

  string += ")";

  let sql = `
SELECT ItemID, Quantity FROM Item
WHERE UserID = ? AND ItemId IN ${string}
`;

  let invoice_sql = `
    INSERT INTO Invoice (UserID, Price)
    VALUES (?, ?)
  `;

  db.all(sql, [userId, ...items.map((item) => item.ItemId)], (err, rows) => {
    if (err) {
      console.log(err);
      return res.status(500).send('Internal Server Error');
    }
    let price = 0.0;
    for (let i = 0; i < itemIdsLength; i++) {
      let addedItem = items[i];

      let itemInDb = rows.find((row) => row.ItemId === parseInt(addedItem.ItemId));

      if (!itemInDb) {
        console.log('Item not found');
        return res.status(500).send('Item not found');
      }

      if (itemInDb.Quantity < addedItem.Quantity) {
        console.log('Not enough stock');
        return res.status(500).send('Not enough stock');
      }
      price += addedItem.Price * addedItem.Quantity;
    }

    db.serialize(() => {
      db.run(invoice_sql, [userId, price], function(err, rows) {
        let invoiceId = this.lastID;
        if (err) {
          console.log(err);
          return res.status(500).send('Internal Server Error');
        }

        let sql = `
INSERT INTO InvoiceItem (InvoiceId, ItemId, Quantity, Price, UserID)
VALUES `;

        let params = [];

        for (let i = 0; i < itemIdsLength; i++) {
          let addedItem = items[i];
          sql += `(?, ?, ?, ?, ?) `;
          if (i < itemIdsLength - 1) {
            sql += ', ';
          }
          params.push(invoiceId);
          params.push(addedItem.ItemId);
          params.push(addedItem.Quantity);
          params.push(addedItem.Price);
          params.push(userId);
        }

        for (let i = 0; i < itemIdsLength; i++) {
          let update_sql = `UPDATE Item SET Quantity = Quantity - ?, SoldQuantity = SoldQuantity + ? WHERE ItemId = ? AND UserID = ?`;
          db.run(update_sql, [items[i].Quantity, items[i].Quantity, items[i].ItemId, userId], (err) => {
            if (err) {
              console.log(err);
              return res.status(500).send('Internal Server Error');
            }
          });
        }

        db.run(sql, params, (err) => {
          if (err) {
            console.log(err);
            return res.status(500).send('Internal Server Error');
          }
          pdf_for_invoice(req, res, invoiceId);
        });
      });

    });
  });
})

//View Stocks
app.get('/viewstocks', checkAuthenticated, (req, res) => {
  let userid = req.user.id;

  let brandQuery = req.query.brand;
  let categoryQuery = req.query.category;

  let sql = `
  SELECT Brand.BrandId, Category.CategoryId, Item.ItemId, Item.CustomItemId, Item.ItemName, Brand.BrandName, Category.CategoryName, Size.SizeName, Item.Price, Item.Quantity
  FROM Item
  LEFT JOIN Brand ON Item.BrandId = Brand.BrandId
  LEFT JOIN Category ON Item.CategoryId = Category.CategoryId
  LEFT JOIN Size ON Item.SizeId = Size.SizeId
  WHERE Item.UserID = ? AND Item.Deleted = 0
  `
    ;
  let sql_params = [userid];
  if (brandQuery) {
    sql += ` AND Brand.BrandId = ? `
    sql_params.push(brandQuery);
  }

  if (categoryQuery) {
    sql += ` AND Category.CategoryId = ? `
    sql_params.push(categoryQuery);
  }

  db.all(sql, sql_params, (err, rows) => {
    if (err) {
      console.log(err);
      return res.status(500).send('Internal Server Error');
    }
    db.all("SELECT BrandId, BrandName FROM Brand WHERE UserID = ? AND Deleted = 0", [userid], (err1, uniqueBrands) => {
      db.all("SELECT CategoryId, CategoryName FROM Category WHERE UserID = ? AND Deleted = 0", [userid], (err2, uniqueCategories) => {
        if (err1 || err2) {
          console.log(err1);
          console.log(err2);
          return res.status(500).send('Internal Server Error');
        }
        return res.render('viewstocks.ejs', {
          stocks: rows,
          brands: uniqueBrands,
          categories: uniqueCategories,
          brandQuery: brandQuery,
          categoryQuery: categoryQuery
        });
      });
    });
  });
})

app.get('/getitem/:itemid', checkAuthenticated, (req, res) => {
  let user_id = req.user.id;
  let item_id = req.params.itemid;
  let sql = `
    SELECT Item.ItemID, Item.ItemName, Category.CategoryName, Brand.BrandName, Size.SizeName, Item.Price, Item.Quantity
    FROM Item
    LEFT JOIN Brand ON Item.BrandId = Brand.BrandId
    LEFT JOIN Category ON Item.CategoryId = Category.CategoryId
    LEFT JOIN Size ON Item.SizeId = Size.SizeId
    WHERE Item.UserID = ? AND Item.ItemID = ?
    LIMIT 1
  `;
  let sql_params = [user_id, item_id];

  db.all(sql, sql_params, (err, rows) => {
    if (err) {
      console.log(err);
      return res.status(500).send('Internal Server Error');
    }

    if (rows.length === 0) {
      return res.status(404).send('Item not found');
    }
    let row = rows[0]

    res.contentType('application/json');
    return res.end(JSON.stringify(row));
  });
})
//Billing
app.get('/billing', checkAuthenticated, (req, res) => {

  let user_id = [req.user.id];

  let category_sql = 'SELECT * FROM Category where UserID = ? AND Deleted = 0';
  let brand_sql = 'SELECT * FROM Brand where UserID = ? AND Deleted = 0';
  let size_sql = 'SELECT * FROM Size where UserID = ? AND Deleted = 0';
  let item_sql = 'SELECT ItemId, CustomItemId, ItemName FROM Item where UserID = ? AND QUANTITY > 0 AND Deleted = 0';

  let _ = db.all(category_sql, user_id, (err, categories) => {
    let _ = db.all(brand_sql, user_id, (err2, brands) => {
      let _ = db.all(size_sql, user_id, (err3, sizes) => {
        let _ = db.all(item_sql, user_id, (err4, items) => {

          if (err || err2 || err3 || err4) {
            console.log(err);
            console.log(err2);
            console.log(err3);
            console.log(err4);
            return res.status(500).send('Internal Server Error');
          }

          res.render('bill.ejs', { category: categories, brand: brands, size: sizes, items: items });
        });
      });
    });
  });
})

//Add New Category
app.post('/addcategory', checkAuthenticated, (req, res) => {
  let userId = req.user.id;
  let sql = 'INSERT INTO Category (CategoryName, UserID, Deleted) VALUES (?, ?, 0)';

  db.run(sql, [req.body.new, userId], (err) => {
    if (err) {
      db.run("UPDATE Category SET Deleted = 0 WHERE CategoryName = ? AND UserID = ?", [req.body.new, userId], (err) => {
        if (err) {
          console.log(err)
          return res.status(500).send('Adding brand failed.');
        }
      });
    }
    res.header('Content-Type', 'application/json');
    res.redirect("/categories");
  });
})


//Add New Brand
app.post('/addbrand', checkAuthenticated, (req, res) => {
  let userId = req.user.id;
  let sql = 'INSERT INTO Brand (BrandName, UserID) VALUES (?, ?)';

  db.run(sql, [req.body.new, userId], (err) => {
    if (err) {
      db.run("UPDATE Brand SET Deleted = 0 WHERE BrandName = ? AND UserID = ?", [req.body.new, userId], (err) => {
        if (err) {
          console.log(err)
          return res.status(500).send('Adding brand failed.');
        }
      });
    }

    res.redirect("/brands");
  });
})

//Add New Size
app.post('/addsize', checkAuthenticated, (req, res) => {
  let userId = req.user.id;
  console.log(req)
  let sql = `INSERT INTO Size(SizeName, UserID) VALUES(?, ?)`;
  db.run(sql, [req.body.new, userId], (err) => {
    if (err) {
      db.run("UPDATE Size SET Deleted = 0 WHERE SizeName = ? AND UserID = ?", [req.body.new, userId], (err) => {
        if (err) {
          console.log(err)
          return res.status(500).send('Adding brand failed.');
        }
      });
    }
    res.redirect("/sizes");
  });
})

//View Categories
app.get('/categories', checkAuthenticated, (req, res) => {
  let userId = req.user.id;
  let sql = 'SELECT * FROM Category WHERE UserID = ? AND Deleted = 0';

  let _ = db.all(sql, [userId], (err, categories) => {
    if (err) {
      console.log(err)
      return res.status(500).send('Internal Server Error');
    }
    res.render('categories.ejs', { category: categories })
  })
})
//View Brands
app.get('/brands', checkAuthenticated, (req, res) => {
  let userId = req.user.id;
  let sql = 'SELECT * FROM Brand WHERE UserID = ? AND Deleted = 0';

  let _ = db.all(sql, [userId], (err, brands) => {
    if (err) {
      console.log(err)
      return res.status(500).send('Internal Server Error');
    }
    res.render('brands.ejs', { brand: brands })
  })
})

//View Sizes
app.get('/sizes', checkAuthenticated, (req, res) => {
  let userId = req.user.id;
  let sql = 'SELECT * FROM Size WHERE UserID = ? AND Deleted = 0';

  let _ = db.all(sql, [userId], (err, sizes) => {
    if (err) {
      console.log(err)
      return res.status(500).send('Internal Server Error');
    }
    res.render('sizes.ejs', { size: sizes })
  })
})

//View Sales
app.get('/sales', checkAuthenticated, (req, res) => {
  let userId = req.user.id;

  let sql = `SELECT 
InvoiceId, Price as TotalPrice, Created
FROM Invoice 
WHERE Invoice.UserID = ?`;

  let _ = db.all(sql, [userId], (err, sales) => {
    if (err) {
      console.log(err)
      return res.status(500).send('Internal Server Error');
    }
    res.render('sales.ejs', { sales: sales })
  })
})


/* PDF genereation */

async function pdf_for_invoice(req, res, invoiceId) {
  let userId = req.user.id;

  let sql = `SELECT 
Invoice.InvoiceId, Item.CustomItemId, Item.ItemName,
Brand.BrandName,
Category.CategoryName,
Size.SizeName,
InvoiceItem.Quantity, InvoiceItem.Price,
Invoice.Price as TotalPrice, Invoice.Created,
User.MobileNumber, User.Email, User.Headquarters, User.UserName

FROM InvoiceItem 
LEFT JOIN Invoice ON InvoiceItem.InvoiceId = Invoice.InvoiceId
LEFT JOIN Item ON InvoiceItem.ItemId = Item.ItemId AND Invoice.UserID = Item.UserID
LEFT JOIN Brand ON Item.BrandId = Brand.BrandId
LEFT JOIN Size ON Size.SizeId = Item.SizeId
LEFT JOIN User ON Invoice.UserID = User.UserID
LEFT JOIN Category ON Item.CategoryId = Category.CategoryId

WHERE Invoice.UserID = ? AND Invoice.InvoiceId = ?`;

  let _ = db.all(sql, [userId, invoiceId], (err, sales) => {
    if (err) {
      console.log(err)
      return res.status(500).send('Internal Server Error');
    }
    let headers = [
      { title: 'ID' },
      { title: 'Név' },
      { title: 'Márka' },
      { title: 'Kategória' },
      { title: 'Méret' },
      { title: 'Mennyiség' },
      { title: 'Ár' },
    ];
    let totalPrice = 0;
    let created = Date.now() / 1000;

    let items = sales.map((sale) => {
      totalPrice = sale.TotalPrice;
      created = sale.Created;
      return [
        sale.CustomItemId,
        sale.ItemName,
        sale.BrandName ?? '-',
        sale.CategoryName ?? '-',
        sale.SizeName ?? '-',
        sale.Quantity,
        sale.Price.toFixed(2) + " €"
      ];
    });

    let vat = (totalPrice * 0.2);
    let withVat = (totalPrice + vat).toFixed(2).toString() + " €";

    var timediff = new Date().getTimezoneOffset() * 60000;
    var time = new Date(created * 1000 - timediff);
    var formattedTime = time.toLocaleString();

    totalPrice = totalPrice.toFixed(2) + " €";
    vat = vat.toFixed(2) + " €";
    let props = {
      returnJsPDFDocObject: true,
      fileName: `szamla-${invoiceId}`,
      orientationLandscape: false,
      compress: true,
      logo: {
        /* src: "https://raw.githubusercontent.com/edisonneza/jspdf-invoice-template/demo/images/logo.png", */
        type: 'PNG', //optional, when src= data:uri (nodejs case)
        width: 53.33, //aspect ratio = width/height
        height: 26.66,
        margin: {
          top: 0, //negative or positive num, from the current position
          left: 0 //negative or positive num, from the current position
        }
      },
      stamp: {
        inAllPages: true, //by default = false, just in the last page
        src: "https://raw.githubusercontent.com/edisonneza/jspdf-invoice-template/demo/images/qr_code.jpg",
        type: 'JPG', //optional, when src= data:uri (nodejs case)
        width: 20, //aspect ratio = width/height
        height: 20,
        margin: {
          top: 0, //negative or positive num, from the current position
          left: 0 //negative or positive num, from the current position
        }
      },
      business: {
        name: sales[0].UserName ?? "",
        address: sales[0].Headquarters ?? "",
        phone: sales[0].MobileNumber ?? "",
        email: sales[0].Email ?? "",
      },
      invoice: {
        label: "Számla #: ",
        num: invoiceId,
        // invDate: "Payment Date: " + formattedTime,
        invGenDate: "Számlázás dátuma: " + formattedTime,
        headerBorder: false,
        tableBodyBorder: false,
        header: headers,
        table: items,
        additionalRows: [
          {
            col1: 'DPH nélkül:',
            col2: totalPrice,
            style: {
              fontSize: 10 //optional, default 12
            }
          },
          {
            col1: 'DPH 20%:',
            col2: vat,
            col3: "",
            style: {
              fontSize: 10 //optional, default 12
            }
          },
          {
            col1: 'Vég összeg:',
            col2: withVat,
            style: {
              fontSize: 14 //optional, default 12
            }
          }
        ],
        invDescLabel: "Lábjegyzet",
        invDesc: "Kérjük, vegye figyelembe, hogy a weboldalunk számlázási funkciójának használatával kapcsolatos adatok és tranzakciók biztonságosan tároljuk és kezeljük az adatvédelmi és biztonsági szabványoknak megfelelve. A számlázási funkció használata során minden tranzakcióról automatikusan generálódik számla, amelyet a felhasználó a felhasználói fiókjában tekinthet meg és letölthet. Amennyiben bármilyen kérdése vagy észrevétele van a számlázási folyamattal kapcsolatban, kérjük, lépjen kapcsolatba ügyfélszolgálatunkkal.",
      },
      pageEnable: true,
      pageLabel: "Page ",
    };

    res.contentType('application/json');
    res.end(JSON.stringify(props));
  })
}

app.get('/invoice-pdf-data/:id', checkAuthenticated, (req, res) => {
  let invoiceId = req.params.id;
  pdf_for_invoice(req, res, invoiceId);
})


//View Stocks
app.get('/stocks', checkAuthenticated, (req, res) => {
  let params = [req.user.id];
  let category_sql = 'SELECT * FROM Category WHERE UserID = ? AND Deleted = 0';
  let brand_sql = 'SELECT * FROM Brand WHERE UserID = ? AND Deleted = 0';
  let size_sql = 'SELECT * FROM Size WHERE UserID = ? AND Deleted = 0';

  let _ = db.all(category_sql, params, (err, categories) => {
    let _ = db.all(brand_sql, params, (err2, brands) => {
      let _ = db.all(size_sql, params, (err3, sizes) => {

        if (err || err2 || err3) {
          console.log(err);
          console.log(err2);
          console.log(err3);
          return res.status(500).send('Internal Server Error');
        }

        res.render('stocks.ejs', { category: categories, brand: brands, size: sizes });
      });
    });
  });
})


//Submit Stock
app.post('/submitstock', checkAuthenticated, (req, res) => {
  var params = req.body
  let itemid = params.itemid ?? null;
  let itemName = params.itemName ?? null;
  let category = params.category ?? null;
  let brand = params.brand ?? null;
  let size = params.size ?? null;
  let amount = params.amount ?? null;
  category = category == "-1" ? null : category;
  brand = brand == "-1" ? null : brand;
  size = size == "-1" ? null : size;

  if (amount) {
    amount = parseFloat(amount);
    amount = amount.toFixed(2);
  }

  let quantity = params.quantity ?? null;
  let userId = req.user.id;

  if (!itemid || !itemName || !amount) {
    return res.status(400).send('Missing required fields');
  }

  let _ = db.all("SELECT * FROM Item WHERE CustomItemId = ? AND UserID = ? AND Deleted = 0", [itemid, userId], (err, rows) => {
    if (err) {
      console.log(err);
      return res.status(500).send('Internal Server Error');
    }

    if (rows.length > 0) {
      return res.status(500).send('Item exists with this id.');
    }

    let sql = 'INSERT INTO Item (BrandId, CategoryId, CustomItemId, ItemName, Price, Quantity, SizeId, UserID) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
    let parameters = [brand, category, itemid, itemName, amount, quantity, size, userId];
    let _ = db.all(sql, parameters, (err) => {
      if (err) {
        console.log(err);
        return res.status(500).send('Item exists with this id.');
      }
      console.log('Successfully added an item')
      res.redirect('/stocks')
    });
  });
})

//Delete Category
app.post('/deletecategory', checkAuthenticated, (req, res) => {
  let deleteid = req.body.deleteid
  let userId = req.user.id;

  let sql = `UPDATE Category SET Deleted = 1 WHERE CategoryId = ? and UserID = ?
    AND NOT EXISTS (
        SELECT 1
        FROM Item
        WHERE Category.CategoryId = Item.CategoryId AND Item.Deleted = 0
    );`;

  let _ = db.all(sql, [deleteid, userId], (err, rows, fields) => {
    if (err) {
      console.log(err);
      return res.status(500).send('Interal server error');
    }
    db.all("SELECT CategoryId from Category WHERE CategoryId = ? AND UserID = ? AND Deleted = 1", [deleteid, userId], (err, rows) => {
      if (err) {
        console.log(err);
        return res.status(500).send('Interal server error');
      }
      if (rows.length === 0) {
        console.log('Category not deleted');
        return res.status(500).send('Item exists with this category name. Cannot delete category.');
      }
      console.log('Successfully deleted a category')
      res.redirect('/categories')
    });
  });
})

//Delete Brand
app.post('/deletebrand', checkAuthenticated, (req, res) => {
  var deleteid = req.body.deleteid
  let userId = req.user.id;
  let sql = `UPDATE Brand SET Deleted = 1 WHERE BrandId = ? and UserID = ? 
    AND NOT EXISTS (
        SELECT 1
        FROM Item
        WHERE Brand.BrandId = Item.BrandId AND Item.Deleted = 0
    );`;

  let _ = db.run(sql, [deleteid, userId], (err, rows) => {
    if (err) {
      console.log(err);
      return res.status(500).send('Interal server error');
    }
    db.all("SELECT BrandId from Brand WHERE BrandId = ? AND UserID = ? AND Deleted = 1", [deleteid, userId], (err, rows) => {
      if (err) {
        console.log(err);
        return res.status(500).send('Interal server error');
      }
      if (rows.length === 0) {
        console.log('Brand not deleted');
        return res.status(500).send('Item exists with this brand name. Cannot delete brand.');
      }
      console.log('Successfully deleted a brand')
      res.redirect('/brands')
    })
  });
})

//Delete Size
app.post('/deletesize', checkAuthenticated, (req, res) => {
  var deleteid = req.body.deleteid
  let userId = req.user.id;
  let sql = `UPDATE Size SET Deleted = 1 WHERE SizeId = ? and UserID = ?
    AND NOT EXISTS (
        SELECT 1
        FROM Item
        WHERE Size.SizeId = Item.SizeId AND Item.Deleted = 0
    );`;

  let _ = db.all(sql, [deleteid, userId], (err, rows, fields) => {
    if (err) {
      console.log(err);
      return res.status(500).send('Interal server error');
    }

    db.all("SELECT SizeId from Size WHERE SizeId = ? AND UserID = ? AND Deleted = 1", [deleteid, userId], (err, rows) => {
      if (err) {
        console.log(err);
        return res.status(500).send('Interal server error');
      }
      console.log(rows)
      if (rows.length === 0) {
        console.log('Size not deleted');
        return res.status(500).send('Item exists with this size. Cannot delete size.');
      }
      console.log('Successfully deleted a size')
      res.redirect('/sizes')
    })
  });
})

//Delete Stock
app.post('/deletestock', checkAuthenticated, (req, res) => {
  let userId = req.user.id;
  var deleteid = req.body.deleteid
  let sql = 'UPDATE Item  SET Deleted = 1 WHERE ItemId = ? and UserID = ?'
  let _ = db.all(sql, [deleteid, userId], (err) => {
    if (err) {
      console.log(err);
      return res.status(500).send('Interal server error');
    }
    res.redirect('/viewstocks')
  });
})

create Table User (
    UserID integer unique NOT NULL PRIMARY KEY autoincrement,
    Email text unique NOT NULL,
    UserName text unique NOT NULL,
    PasswordHash text NOT NULL,
    PasswordSalt text NOT NULL,
    MobileNumber text unique NOT NULL,
    Headquarters text NOT NULL
);

create Table Category (
    CategoryId integer unique NOT NULL PRIMARY KEY autoincrement,
    CategoryName text NOT NULL,
    UserID integer NOT NULL REFERENCES User (UserID),
    Deleted integer NOT NULL default 0,
    unique(CategoryName, UserID)
);

create Table Size (
    SizeId integer unique NOT NULL PRIMARY KEY autoincrement,
    SizeName text NOT NULL,
    UserID integer NOT NULL REFERENCES User (UserID),
    Deleted integer NOT NULL default 0,
    unique(SizeName, UserID)
);

create Table Brand (
    BrandId integer unique NOT NULL PRIMARY KEY autoincrement,
    BrandName text NOT NULL,
    UserID integer NOT NULL REFERENCES User (UserID),
    Deleted integer NOT NULL default 0,
    unique(BrandName, UserID)
);

create Table Item (
    ItemId integer unique NOT NULL PRIMARY KEY autoincrement,
    CustomItemId text NOT NULL,
    ItemName text NOT NULL,
    Price real NOT NULL,
    Quantity integer NOT NULL,
    SoldQuantity integer NOT NULL default 0,
    BrandId integer,
    SizeId integer,
    CategoryId integer,
    UserID integer NOT NULL,
    Deleted integer NOT NULL default 0,
    FOREIGN KEY (UserID) REFERENCES User (UserID),
    FOREIGN KEY (BrandId) REFERENCES Brand (BrandId),
    FOREIGN KEY (CategoryId) REFERENCES Category (CategoryId),
    FOREIGN KEY (SizeId) REFERENCES Size (SizeId),
    unique(ItemId, UserID)
);

create Table Invoice (
    InvoiceId integer unique NOT NULL PRIMARY KEY autoincrement,
    Price real NOT NULL,
    UserID integer NOT NULL REFERENCES User (UserID),
    Created INTEGER DEFAULT (CAST(strftime('%s', 'now', 'utc') AS INTEGER)) 
);

create Table InvoiceItem (
    InvoiceItemId integer unique NOT NULL PRIMARY KEY autoincrement,
    InvoiceId integer NOT NULL,
    UserID integer NOT NULL,
    ItemId integer NOT NULL,
    Quantity integer NOT NULL,
    Price real NOT NULL,
    FOREIGN KEY (InvoiceId) REFERENCES Invoice (InvoiceId)
    FOREIGN KEY (ItemId) REFERENCES Item (ItemId)
);


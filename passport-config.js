const LocalStrategy = require('passport-local')
const bcrypt = require('bcrypt')

function initialize(passport, getUserByName, getUserById) {
    const authenticateUser = async(name, password, done) => {
        console.log(name)
        console.log(password)
        console.log("authenticateuser")
        const user = getUserByName(name)
        if (user == null) {
            return done(null, false, { message: 'No user with that email' })
        }

        try {
            if (await bcrypt.compare(password, user.password)) {
                return done(null, user)
            } else {
                return done(null, false, { message: 'Password incorrect' })
            }
        } catch (e) {
            return done(e)
        }
    }
    console.log("init")
    passport.use(new LocalStrategy(authenticateUser))

    passport.serializeUser((user, done) => done(null, user.id))
    passport.deserializeUser((id, done) => {
        return done(null, getUserById(id))
    })
}

module.exports = initialize
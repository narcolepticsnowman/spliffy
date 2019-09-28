const jwt = require('jsonwebtoken')
const config = require('./serverConfig')

const makeArray = (obj) => obj && Array.isArray(obj) ? obj : [obj] || []

const getAll = (prop, handlerInfo, routeInfo) =>
    [
        ...makeArray(handlerInfo.allow && handlerInfo.allow[prop]),
        ...makeArray(routeInfo.allow && routeInfo.allow[prop]),
        ...makeArray(config.current.auth && config.current.auth.appAllow && config.current.auth.appAllow[prop])
    ]


module.exports = ({req, res, handlerInfo, routeInfo}) => {
    let jwtConfig = config.current.auth.jwt
    let users = getAll("users", handlerInfo, routeInfo)
    let roles = getAll("roles", handlerInfo, routeInfo)
    //determine if authentication is enabled for this route, this should be done at route load time to avoid doing it multiple times
    //if auth is enabled, verify the jwt token, then check to ensure the user is allowed or has an allowed role
    try{
        let claims = jwt.verify( req.cookies['at'], jwtConfig.secret || jwtConfig.publicKey, { ...jwtConfig.options})
        return {auth:{claims: claims, roles}}
    } catch {
        res.statusCode = 401
        res.statusMessage = "Unauthorized"
        res.finished = true
    }
}

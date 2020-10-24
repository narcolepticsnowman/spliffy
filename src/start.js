const { validateMiddleware } = require( './routes.js' )
const http = require( 'http' )
const serverConfig = require( './serverConfig' )
const dispatcher = require( './dispatcher' )
const content = require( './content' )
const routes = require( './routes' )
const secure = require( './secure' )
const letsEncrypt = require( './letsEncrypt' )
const log = require( './log' )


const defaultHeaders = {
    acceptsDefault: '*/*',
    defaultContentType: '*/*'
}

const nonsense = [
    'Is it getting hot in here?',
    'Ouch...',
    'Hold my beer',
    'Gettin\' Sendy',
    'Look a squirrel!',
    'I swear I only had 3',
    'I see a light...',
    'Totally zooted'
]

const randomNonsense = () => nonsense[ Math.floor( Math.random() * nonsense.length ) ]

module.exports = async function( config ) {
    if( !config || !config.routeDir ) {
        throw 'You must supply a config object with at least a routeDir property. routeDir should be a full path.'
    }
    log.gne('Starting Spliffy!')
    serverConfig.current = config || {}
    Object.assign( content.contentHandlers, config.contentHandlers )
    if( !config.hasOwnProperty( 'decodePathParameters' ) ) serverConfig.current.decodePathParameters = true


    serverConfig.current.acceptsDefault = config.acceptsDefault || defaultHeaders.acceptsDefault
    serverConfig.current.defaultContentType = config.defaultContentType || defaultHeaders.defaultContentType

    if( serverConfig.current.middleware ) {
        validateMiddleware( serverConfig.current.middleware )
    }

    if( !serverConfig.current.hasOwnProperty( 'logAccess' ) ) {
        serverConfig.current.logAccess = true
    }
    serverConfig.current.port = config.port || 10420
    routes.init()

    let httpServer

    let consecutiveFailures = 0
    let lastStart = new Date().getTime()

    const doStart = async() => {
        try {
            if( config.secure ) {
                if( config.secure.letsEncrypt ) {
                    letsEncrypt.init( true )
                               .catch( e => {
                                   setTimeout( () => {throw e} )
                               } )

                } else {
                    secure.startHttps( config.secure )
                }
                secure.startHttpRedirect()
            } else {
                httpServer = http.createServer( dispatcher )
                                 .listen( serverConfig.current.port )
                log.gne( `Server initialized at ${new Date().toISOString()} and listening on port ${serverConfig.current.port}` )
            }
        } catch(e) {
            try {

                log.error( randomNonsense(), e )
                const secureServers = secure.getServers()
                if( secureServers.redirectServer )
                    await new Promise( res => secureServers.redirectServer.close( res ) )
                if( secureServers.server )
                    await new Promise( res => secureServers.server.close( res ) )
                if( httpServer )
                    await new Promise( res => httpServer.close( res ) )
                const now = new Date().getTime()
                if( now - lastStart <= 10 * 60 * 1000 ) {
                    consecutiveFailures++
                } else {
                    consecutiveFailures = 0
                }
            } finally {
                const waitms = Math.pow( 2, consecutiveFailures ) * 100
                log.error( `Server crashed, restarting in ${waitms}ms` )

                setTimeout( () => {
                    lastStart = new Date().getTime()
                    doStart()
                }, waitms )
            }
        }
    }

    doStart()
    process.on('unhandledRejection', (reason, p) => {
        log.error(reason, 'Unhandled Rejection at Promise', p);
    }).on( 'uncaughtException', (err, origin) => {
        log.error( `Caught exception: ${err}\n` +
                   `Exception origin: ${origin}` )
    } )
}
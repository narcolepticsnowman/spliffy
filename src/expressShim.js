const cookie = require( 'cookie' )
const serverConfig = require( './serverConfig' )
const http = require( 'http' )
const { parse, setMultiValueKey } = require( './url' )
const setCookie = ( res ) => function() {
    return res.setHeader( 'Set-Cookie', [...( res.getHeader( 'Set-Cookie' ) || [] ), cookie.serialize( ...arguments )] )
}
const log = require( './log' )
const addressArrayBufferToString = addrBuf => String.fromCharCode.apply( null, new Int8Array( addrBuf ) )
const excludedMessageProps = {
    setTimeout: true,
    _read: true,
    destroy: true,
    _addHeaderLines: true,
    _addHeaderLine: true,
    _dump: true,
    __proto__: true
}

const normalizeHeader = header => header.toLowerCase()

/**
 * Provide a minimal set of shims to make most middleware, like passport, work
 * @type {{decorateResponse(*=, *=, *): *, decorateRequest(*): *}}
 */
module.exports = {
    setCookie,
    decorateRequest( uwsReq, pathParameters, res ) {
        //uwsReq can't be used in async functions because it gets de-allocated when the handler function returns
        let req = {}
        let query = uwsReq.getQuery()
        req.path = uwsReq.getUrl()
        req.url = `${req.path}${query ? '?' + query : ''}`
        req.spliffyUrl = parse( uwsReq.getUrl(), uwsReq.getQuery() )
        req.spliffyUrl.pathParameters = {}
        if( pathParameters && pathParameters.length > 0 ) {
            for( let i in pathParameters ) {
                req.spliffyUrl.pathParameters[pathParameters[i]] = serverConfig.current.decodePathParameters
                    ? decodeURIComponent( uwsReq.getParameter( i ) )
                    : uwsReq.getParameter( i )
            }
        }
        req.params = req.spliffyUrl.pathParameters
        req.headers = {}
        req.method = uwsReq.getMethod().toUpperCase()
        req.remoteAddress = addressArrayBufferToString( res.getRemoteAddressAsText() )
        req.proxiedRemoteAddress = addressArrayBufferToString( res.getProxiedRemoteAddressAsText() ) || undefined
        uwsReq.forEach( ( header, value ) => setMultiValueKey( req.headers, header.toLowerCase(), value ) )
        req.get = header => req.headers[header.toLowerCase()]
        if( serverConfig.current.parseCookie && req.headers.cookie ) {
            req.cookies = cookie.parse( req.headers.cookie ) || {}
        }
        //frameworks like passport like to modify the message prototype...
        for( let p of Object.keys( http.IncomingMessage.prototype ) ) {
            if( !req[p] && !excludedMessageProps[p] ) req[p] = http.IncomingMessage.prototype[p]
        }
        return req
    },
    decorateResponse( res, req, finalizeResponse ) {
        res.onAborted( () => {
            res.ended = true
            res.writableEnded = true
            res.finalized = true
            log.warn( `Request to ${req.url} from ${res.remoteAddress || ''} ${res.proxiedRemoteAddress || ''} was aborted. Possible client disconnect.` )
        } )
        const initHeaders = {}

        res.headers = {}
        res.headersSent = false
        res.setHeader = ( header, value ) => {
            res.headers[normalizeHeader( header )] = value
        }
        res.removeHeader = header => {
            delete initHeaders[normalizeHeader( header )]
            delete res.headers[normalizeHeader( header )]
        }
        res.flushHeaders = () => {
            if( res.headersSent ) return
            res.headersSent = true
            // https://nodejs.org/api/http.html#http_response_writehead_statuscode_statusmessage_headers
            //When headers have been set with response.setHeader(), they will be merged with any headers passed to response.initHeaders(), with the headers passed to response.initHeaders() given precedence.
            Object.assign( res.headers, initHeaders )
            for( let header of Object.keys( res.headers ) ) {
                if( Array.isArray( res.headers[header] ) ) {
                    for( let multiple of res.headers[header] ) {
                        res.writeHeader( header, multiple.toString() )
                    }
                } else {
                    res.writeHeader( header, res.headers[header].toString() )
                }
            }
        }
        res.writeHead = ( status, headers ) => {
            this.statusCode = status
            res.assignHeaders( headers )
        }
        res.assignHeaders = headers => {
            for( let header of Object.keys( headers ) ) {
                initHeaders[header.toLowerCase()] = headers[header]
            }
        }
        res.getHeader = header => {
            let normalized = normalizeHeader( header );
            return initHeaders[normalized] || res.headers[normalized]
        }
        res.status = ( code ) => {
            this.statusCode = code
            return this
        }

        const ogEnd = res.end
        res.ended = false
        res.end = body => {
            if( res.ended ) {
                return
            }
            res.ended = true
            //has to be separate to allow streaming
            if( !res.writableEnded ) {
                res.writableEnded = true
                res.writeStatus( `${res.statusCode} ${res.statusMessage}` )
                res.flushHeaders()
                ogEnd.call( res, body )
            }
            if( typeof res.onEnd === 'function' ) {
                res.onEnd()
            }
        }

        res.redirect = function( code, location ) {
            if( arguments.length === 1 ) {
                location = code
                code = 301
            }
            return finalizeResponse( req, res, {
                statusCode: code,
                headers: {
                    'location': location
                }
            } )
        }
        res.send = ( body ) => {
            finalizeResponse( req, res, body )
        }
        res.json = res.send
        res.setCookie = setCookie( res )
        res.cookie = res.setCookie
        return res

    }
}
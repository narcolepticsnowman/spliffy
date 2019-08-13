# ![Alt text](spliffy_logo_text_small_1.png?raw=true "Spliffy Logo")

> Node web framework with apache like dir based route config to get you lit quick

## Getting started
Create a directory for your api and a root directory for your routes

```mkdir -p ~/api/www```

Install spliffy

```cd ~/api && npm install --save spliffy```

Then create a handler js file in that directory with the name of the end point. 

```vi ~/api/www/spliffy.js```
```js
module.exports = {
    GET: () => "hello spliffy"
}
```

Create the start script, ```vi ~/api/serve.js```, routeDir should be an absolute path. 
```js
require('spliffy')({routeDir: __dirname+ '/www'})
```

start the server
```node ~/api/serve.js```

Make a request to ```localhost:10420/spliffy```

### Static Files
Any non-js files will be served verbatim from disk.

If you add or rename files, you must restart the server for the changes to take effect.

Any file prefixed with 'index.' (i.e. index.html, index.txt, index.png) will be served as the default file in the directory they are in.

The extension determines the content-type of the file for the known types listed at mozilla.org: https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types/Complete_list_of_MIME_types

You can also add custom extension to content-type mappings by setting the staticContentTypes property on the config.

GET is the only supported request method for static files, all other request methods will result in a 405 Method Not Allowed.

ETags will be generated on startup and will be recalculated if the file content changes. The cache-control max-age is set to 10min by default for static files.

You can configure this with the staticCacheControl property of the config.

If you want to serve a .js file as a static file instead of having it be a route handler, change the extension to .static.js. 

### JS Request Handler
```js
module.exports = {
    GET: ({url, body, headers, req, res}) => {        
        body: "hello Mr. Marley"
    }
}
```

The exported properties are all caps request methods, any request method is allowed.

Files named index.js can be created to handle the route of the name of the folder just like in apache.

Handler arguments:
- **url**: An object containing path and parameter information about the url
    - **path**: The path of the current request
    - **query**: An object containing the query parameters. Not decoded by default. This can be configured by setting the decodePathParameters to true.
    - **pathParameters**: parameters that are part of the path. Not decoded by default. This can be configured by setting the decodeQueryParameters to true.
- **body**: The body of the request
- **headers**: The request headers
- **req**: The un-adulterated node http.IncomingMessage
- **res**: The un-adulterated node http.ServerResponse

#### Handler Return
The handler can return any kind of data and it will be serialized automatically if there is a known serializer for the specified content-type.
The default, application/json, is already set.

If the returned value is Falsey, we will assume everything is fine and return a 200 OK.

You can return a promise that resolves to the response value, and the server will respond with the resolved value.

If you need to set the statusCode, headers, etc, you must return an object with a body property for the body and optionally one or more of the following properties
```js
{
    headers: {
        "cache-control": 'no-cache'
    },
    body: {
        some: 'object'
    },
    statusCode: 420,
    statusMessage: "Enhance Your Calm"
}
```

## Config
These are all of the settings available and their defaults. You can include just the properties you want to change or all of them.
```js
{
    port: 10420,
    routeDir: './www',
    routePrefix: "api",
    filters: [
        ( url, req, reqBody, res, handler) => {
            res.finished = true
        }
    ]
    acceptsDefault: "*/*",
    defaultContentType: "*/*",
    contentHandlers: {
        'application/json': {
            read: requestBody => JSON.parse(requestBody),
            write: responseBody => JSON.stringify(responseBody)
        }
    },
    staticContentTypes: {
        '.foo': 'application/foo'
    },
    staticCacheControl: "max-age=86400"
}
```

- **port**: The port for the server to listen on
- **routeDir**: The directory the routes are contained in, should be an absolute path
- **routePrefix**: A prefix that will be included at the beginning of the path for every request. 
            For example, a request to /foo becomes /routePrefix/foo
- **filters**: An array of functions to filter incoming requests
    - **url**: See handler url argument
    - **req**: The un-adulterated node IncomingMessage request object
    - **reqBody**: The original unmodified request body
    - **res**: The un-adulterated node ServerResponse response object
    - **handler**: The request handler that will handle this request
- **acceptsDefault**: The default mime type to use when accepting a request body. */* will convert objects from json by default
- **defaultContentType**: The default mime type to use when writing content to a response. will convert objects to json by default
- **contentHandlers**: Content negotiation handlers. mime types must be lower case.
    - **read**: A method to convert the request body to an object 
    - **write**: A method to convert the response body to a string
- **staticContentTypes**: Custom file extension to content-type mappings. These overwrite default mappings from: https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types/Complete_list_of_MIME_types
- **staticCacheControl**: Custom value for the Cache-Control header of static files
- **decodePathParameters**: run decodeURIComponent(param.replace(/\+/g,"%20")) on each path parameter value. This is enabled by default.
- **decodeQueryParameters**: run decodeURIComponent(param.replace(/\+/g,"%20")) on each query parameter key and value. This is disabled by default. The recommended way to send data is via json in a request body.


#### A note on Filters
Filters can prevent the request from being handled by setting res.finished = true. This will short-circuit the filters
and return immediately as soon as it has been set.

## Routes
Routes are based entirely on their directory structure much like they are in apache.

Example dir:
- www
    - strains
        - gorillaGlue.js
        - blueDream.js
        - indica
            - index.js
        - sativa
            - index.js
            - smokeit.js
        - index.js

This would create the following route mappings:
- /strains/ > /www/strains/index.js
- /strains/gorillaGlue > /www/strains/gorillaGlue.js
- /strains/blueDream > /www/strains/blueDream.js
- /strains/indica/ > /www/strains/indica/index.js
- /strains/sativa/ > /www/strains/sativa/index.js
- /strains/sativa/smokeit > /www/strains/sativa/smokeit.js

#### Path variables
You can include path variables by prefixing the folder or file name with a $

Example dir:
- www
    - strains
        - $strainName
            - info

would handle:

- /www/strains/gorillaGlue/info
- /www/strains/blueDream/info

The path parameters are available in the pathParameters object on the first argument passed to the handler

The variable will be the folder or file name excluding the $, i.e. $strainName -> { strainName: 'gorillaGlue'}

**You can only have on variable file/folder within any given folder. This is because it would be ambiguous which one to use and thus the result couldn't be defined. 

#### Catchall path
You can make a handler handle all requests that start with the given path by appending a + to the file or folder name.

Example dir:
- www
    - strains+.js

would handle:

- /www/strains/gorillaGlue/info/something/more/stuff
- /www/strains/blueDream/dankness/allOfIt

##### Feature backlog (ordered by priority)
- ssl w/letsEncrypt certificate support
- authentication/authorization filter with default and per handler configuration
- compression
- redirect helper function
- caching filter
- more robust content handling
- multipart file handling

### Breaking changes
breaking changes are tracked in the breaking-changes.log
class ServiceComponent {

    myAppConfig = null

    constructor (theAppConfig) {
        //console.log (`ServiceComponent constructor called with dataUrl '${theAppConfig.DocumentEndPoint}'`)
        this.myAppConfig = theAppConfig
    }

    fetchDataFromGoogleDrive () {
        const self = this
        const promise = new Promise (function (resolve, reject) {
            // try to fetch the data from google drive
            try {
                /**
                 * i'm now hosting my own service proxy on heroku
                 * fetch (self.myAppConfig.CORSProxyURL + self.myAppConfig.DocumentEndPoint)
                 */
                fetch (self.myAppConfig.DocumentEndPoint)
                .then( response => {
                    if( response.ok ) {
                        // we await json data 
                        response.json()
                            .then(data => {
                                // and return the array of entries
                                resolve (data.value)
                            })
                    } else {
                        reject(`HTTP error: ${response.status}`)
                    }
                })
                .catch(error => {
                    reject(error)
                })
            } catch (e) {
                reject (`oops ... something went wrong: '${e.message}'`)
            }
        })
        return promise
    }
}

export default ServiceComponent
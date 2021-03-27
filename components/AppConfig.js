class AppConfig {

    CORSProxyURL_PROD = 'https://cors-anywhere.herokuapp.com/'
    CORSProxyURL_DEV = 'http://localhost:8080/'
    /**
     * this is the url for downloading a shared google drive file
     * TODO: look at this: https://developers.google.com/drive/api/v3/manage-downloads
     */
    documentEndPoint = 'https://drive.google.com/uc?export=download&id=1hvpoA2NNjfe8PELZNxWR7mJnNMQ4Sn49'
    isRunningInDevEnvironment

    /**
     * default for isRunningInDevEnvironment is FALSE
     * this param is optional
     * 
     * @param {*} isRunningInDevEnvironment 
     */
    constructor (isRunningInDevEnvironment = false) {
        this.isRunningInDevEnvironment = isRunningInDevEnvironment
    }

    get CORSProxyURL () {
        return (this.isRunningInDevEnvironment ? this.CORSProxyURL_DEV :  this.CORSProxyURL_PROD)
    }

    get DocumentEndPoint () {
        return this.documentEndPoint
    }
}

export default AppConfig

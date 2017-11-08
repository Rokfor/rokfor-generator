# Rokfor Generator

Hi! This is the PDF-generator module for the Rokfor CMS. It's written in node.js and using LaTeX as document processor.

## Dependencies

- a complete LaTeX/TeTeX distro (eg. `apt-get install texlive-full`)
- `pdfinfo` from poppler-utilities (eg. `apt-get install poppler-utils`)
- `node.js` and `npm`
- An S3 account to upload generated docs
- A running installation of the [Rokfor CMS](http://cloud.rokfor.ch)

Clone this repo, run `npm install` and `node index.js`.
Configuration is required, copy `config.local.js` to `config.js` and edit the settings.

## Start the Generator

Invoke the generation process by issuing a Export Action in the Rokfor backend:

![Exporter Hook](https://raw.githubusercontent.com/Rokfor/rokfor-generator/master/doc/exporter-hook.png)

The action in the image above would call the generator with `[POST] http://generator.example.com:8888/generator/test`. This would trigger the plugin named `test`. `test` needs to be defined in the `templates` folder.
After generation the generator will call back the Rokfor CMS posting the process status. The results are stored in the exporters Section.

## Github/Gitlab integration

Creating plugins can be a tedious try-and-error process. To ease the deployment a little, it is possible to hook repositories to the generator. Push Events to Github/Gitlab can trigger a clone/pull event via a configured webhook. So you can develop your template in your own github or gitlab repo.

    github        : {
      user        : '',                         // Omit for public repo
      password    : '',                         // Omit for public repo
      secret      : 'token-defined-in-webhook'
    },
    gitlab        : {
      user        : '',
      password    : '',
      secret      : 'token-defined-in-webhook'
    }

__Most important is to define a secret!__ Otherwise your generator instance can not determine if the webhook action is issued from a reliable git account. The same secret needs to be set in the github/gitlab webhook setting.

Github Hook                |  Gitlab Hook
:-------------------------:|:-------------------------:
![Github Hook](https://raw.githubusercontent.com/Rokfor/rokfor-generator/master/doc/github-webhook.png)  |  ![Gitlab Hook](https://raw.githubusercontent.com/Rokfor/rokfor-generator/master/doc/gitlab-webhook.png)

If you set up your hooks successfully, everytime you push changes to your template, the generator will sync the repo. Use the same secret for multiple repos so that the generator is able to sync more than one repo.

## Templates

See the [readme](./templates/readme.md) in the templates folder.
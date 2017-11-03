# Rokfor Generator

Hi! This is the PDF-generator module for the Rokfor CMS. It's written in node.js and using LaTeX as document processor.

## Dependencies

- a complete LaTeX distro (eg. `apt-get install texlive-full`)
- `node.js` and `npm`
- An S3 account to upload generated docs
- A running installation of the [Rokfor CMS](http://cloud.rokfor.ch)

Clone this repo, run `npm install` and `node index.js`.
Configuration is required, copy `config.local.js` to `config.js` and edit the settings.

## Start the Generator

Invoke the generation process by issuing a Export Action in the Rokfor backend:

![alt text](https://raw.githubusercontent.com/username/projectname/branch/path/to/img.png)


`POST` on `http://localhost:8888/generator/:pluginname`

It triggers then the `test` plugin which needs to be defined in the `templates` folder.

## Templates

Templates need a central `config.js` file which define the production of a PDF. The generator runs thru the object generating (several) pdfs named by the key. Each document is further split in a array of objects, each defining a template and a controller.

- **Templates** are LaTex fragments, using the [Nunjucks](https://mozilla.github.io/nunjucks) template language
- **Controllers** are async functions getting a utils class instance as their parameter, returning a object which will be sent to the nunjuck renderer. It probably contains all the data to populate a template.

The utility class contains some helper functions:

- `getRf` issues a GET call to the Rokfor CMS defined in the configuration file of the generator.
- `md2Tex` returns a LaTeX string from a markdown string. Markdown is widely used in the Rokfor CMS to store text content.
- `img2Tex` prepares an image array (i.E `d.Data.Image.Content` assuming `d` is returned from Rokfor) for further use in a template.

## Example Template Config File

This configuration file would produce 2 pdfs, on called pages, the other cover. The first compiles two .tex templates, the latter one.

    module.exports = {
      pages : [
        {
          template    : 'page/0_pre.tex',
          controller  : async function(u) {
            var d = await u.getRf(`${u.gdata.selection.Mode}/${u.gdata.selection.Value}`, {status:'both'});
            return({Title: d.Contribution.Name, Autor: "Urs Hofer"});
          }
        },
        {
          template    : 'page/2_post.tex',
          controller  : function(module) {return({Footer: "Fusszeile"});}
        }
      ],
      cover : [
        {
          template    : 'page/cover.tex',
          controller  : function(module) {return({Title: "Dies ist der Titel", Autor: "Urs Hofer"});}
        }
      ]  
    }


### Rokfor Generator

Hi! This is the PDF-generator module for the Rokfor CMS. 

# About

Rokfor Generator waits for a POST call on a specified URL.

`http://localhost:8888/test`

It triggers then the `test` plugin which needs to be defined in the `templates` folder.

# Templates

Templates need a central `config.js` file which define the production of a PDF. The generator runs thru the object generating (several) pdfs named by the key. Each document is further split in a array of objects, each defining a template and a controller.

- **Templates** are LaTex fragments, using the Nunjucks (https://mozilla.github.io/nunjucks) template language
- **Controllers** are async functions getting a utils class instance as their parameter, returning a object which will be sent to the nunjuck renderer. It probably contains all the data to populate a template.

The utility class contains some helper functions:

- `getRf` issues a GET call to the Rokfor CMS defined in the configuration file of the generator.
- `md2Tex` returns a LaTeX string from a markdown string. Markdown is widely used in the Rokfor CMS to store text content.
- `img2Tex` prepares an image array (i.E `d.Data.Image.Content` assuming `d` is returned from Rokfor) for further use in a template.

# Example Template Config File

  module.exports = {
    pages : [
  	{
  		template    : 'page/0_pre.tex',
  		controller  : async function(u) {
  			var d = await u.getRf(`${u.gdata.selection.Mode}/${u.gdata.selection.Value}`, {status:'both'});
  			return({Title: d.Contribution.Name, Autor: "Beat Mazenauer"});
  		}
  	},
  	…
  	{
  		template    : 'page/2_post.tex',
  		controller  : function(module) {return({Footer: "Fusszeile"});}
  	}
    ],
    cover : [
  	{
  		template    : 'page/cover.tex',
  		controller  : function(module) {return({Title: "Dies ist der Titel", Autor: "Beat Mazenauer"});}
  	}
    ]  
  }


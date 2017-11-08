# Templates

### Folder Structure:

You need a config.js file, and .tex fragments in a subfolder according to your needs:

    ./config.js
    ./page
         | template-1.tex
         | template-2.tex
         | ...
         | template-x.tex
         | cover.tex

## The `config.js` file:

Templates need a central `config.js` file which define the workflow and the production of PDFs. The generator runs thru the object generating (several) pdfs named by their key.

*Example*

This configuration file would produce 2 pdfs, on called *pages*, the other *cover*. The first compiles two .tex templates, the latter one.

    module.exports = {
      pages : [
        {
          template    : 'page/template-1.tex',
          controller  : async function(u) {
            var d = await u.getRf(`${u.gdata.selection.Mode}/${u.gdata.selection.Value}`, {status:'both'});
            return({Title: d.Contribution.Name, Autor: "Urs Hofer"});
          }
        },
        {
          template    : 'page/template-2.tex',
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


## Writing Controllers

Controllers are async functions getting a utils class instance as their parameter (u), returning a object which will be sent to the nunjuck renderer. This will be probably an object containing all the data to populate your template.

The utility class contains some helper functions. If you want to investigate furher, check out `utils.js` in the `/lib` folder of this repository:

- `getRf` issues a GET call to the Rokfor CMS. The Rokfor API is defined in the configuration file of the generator. Refer to the Rokfor API Documentation for more info.
- `md2Tex` returns a LaTeX string from a markdown string. Markdown is widely used in the Rokfor CMS to store text content.
- `img2Tex` prepares an image array (i.E `d.Data.Image.Content` assuming `d` is returned from Rokfor) for further use in a template.

## Writing TeX Templates

Pages are compiled one after the other and their output simply added to one, large .tex file. Templates are LaTex fragments, piped through the [Nunjucks](https://mozilla.github.io/nunjucks) template language.

This is for example valid:

    <% for ingredient, amount in Text %>
      \par Use <$ amount $> of <$ ingredient $>
    <% endfor %>

The controller could return something like:

    controller  : function(module) {
      return({Text: {
        'ketchup': '5 tbsp',
        'mustard': '1 tbsp',
        'pickle': '0 tbsp'
      }});
    }


import React, {Component} from 'react'
import nearley from 'nearley'

import compile from './compile'
import {ParserRules, ParserStart} from 'nearley/lib/nearley-language-bootstrapped'
import generate from 'nearley/lib/generate.js'
import lint from 'nearley/lib/lint.js'

import CodeMirror  from 'codemirror'

import 'codemirror/lib/codemirror.css'

import 'codemirror/theme/elegant.css'
import './theme.css'

import 'codemirror/addon/mode/multiplex'
import 'codemirror/mode/javascript/javascript'
import 'codemirror/mode/ebnf/ebnf'

import 'codemirror/keymap/sublime'



function stream() {
    let out = ''
    return {
        write(str) {out += str},
        dump() {return out}
    }
}

function get_exports(source){
    let module = {exports:''}
    eval(source)
    return module.exports
}

CodeMirror.defineMode("nearley", config => 
    CodeMirror.multiplexingMode(
        CodeMirror.getMode(config, "ebnf"),
        {   
            open: "{%",
            close: "%}",
            mode: CodeMirror.getMode(config, "javascript"),
            delimStyle: "js-delimit"
        },
        {   
            open: /^\s*#/,
            close: /.*$/,
            mode: CodeMirror.getMode(config, "text/plain"),
            delimStyle: "comment-delimit"
        }
    )
)


function AnnotatePositions(rules){
    return rules.map(rule => 
        new nearley.Rule(rule.name, rule.symbols, rule.postprocess && ((data, ref, reject) => {
            var orig = rule.postprocess(data, ref, reject);
            if(typeof orig == 'object' && !orig.slice){
                orig.pos = ref;
            }
            return orig
        }))
    )
}

export default class Editor extends Component {
    state = {
        raw: '',
        output: '',
        errors: '',
        positions: {}
    };
    componentDidMount(){
        let initial_val = localStorage.raw_grammar || require('./arithmetic.ne')
        this.compile(initial_val);
        var cm = CodeMirror(this.refs.wrap, {
            mode: 'nearley',
            value: initial_val,
            tabSize: 4,
            matchBrackets: true,
            autoCloseBrackets: true,
            indentUnit: 4,
            keyMap: 'sublime',
            indentWithTabs: true,
            lineWrapping: true,
            theme: 'elegant',
            viewportMargin: Infinity,
            // lineNumbers: true,
            // extraKeys: 
        })

        this.cm = cm;
        // global.cm = cm; // DEBUGGING

        cm.on('change', (cm, change) => {
            this.compile(cm.getValue())
        })

    }
    compile(grammar) {

        localStorage.raw_grammar = grammar

        let parser = new nearley.Parser( AnnotatePositions(ParserRules), ParserStart )

        let errors = stream()
        let output = ''
        let positions = {}

        try {
            parser.feed(grammar)            
            if(parser.results[0]){
                function rangeCallback(name, start, end){
                    positions[name] = [start, end]
                }
                var c = compile(parser.results[0], { rangeCallback: rangeCallback });
                lint(c, {out: errors});

                output = generate(c, 'grammar')
                this.props.setGrammar(get_exports(output))
            }
        } catch(e) {
            console.error(e)
            errors.write(e)
        }

        this.setState({
            errors: errors.dump(),
            positions: positions
        })
    }
    componentDidUpdate(){
        // console.log(ParserRules)
        this.cm.getAllMarks()
            .filter(k => k.nearley)
            .forEach(k => k.clear())

        for(let key of this.props.highlight){
            if(key in this.state.positions){
                var [start, end] = this.state.positions[key];

                var mark = this.cm.markText(
                    this.cm.posFromIndex(start),
                    this.cm.posFromIndex(end), {
                    className: 'active'
                })
                mark.nearley = true;
            }
        }

    }
    render(){
        return <div className='editor'>
            <div className='shadow'/>
            <div className='cm-wrap' ref='wrap'></div>
            {this.state.errors.length 
                ? <div className='errors'>{this.state.errors}</div>
                : ''}
        </div>
    }
}
window.addEventListener("load", () => {

    function parse_csv(csv_string) {
        const header = [];
        const array = [];
        const delimiter = ";";
        csv_string.split("\n").forEach((line, i) => {
            if (i == 0) {
                line.split(delimiter).forEach(token => {
                    header.push(token);
                });
            } else if (line.trim() != "") {
                const row = {};
                line.split(delimiter).forEach((token, j) => {
                    if (token.match(/^\d+$/)) {
                        row[header[j]] = parseInt(token);
                    } else {
                        row[header[j]] = token.replaceAll("\"\"\"", "\"");
                    }
                });
                array.push(row);
            }
        });
        return array;
    }

    function inflate_table_data(array) {
        const header = [];
        for (let column in array[0]) {
            header.push(column);
        }
        const table = document.getElementById("table-data");
        const table_head = document.createElement("thead");
        const tr_head = document.createElement("tr");
        header.forEach((col, j) => {
            if (j == 0) {
                // pass
            } else {
                const th = document.createElement("th");
                th.textContent = col;
                tr_head.appendChild(th);
                if (j >= 3) {
                    th.classList.add("vertical");
                }
            }
        });
        table_head.appendChild(tr_head);
        table.appendChild(table_head);
        const table_body = document.createElement("tbody");
        table.appendChild(table_body);
        array.forEach(entry => {
            const tr = document.createElement("tr");
            header.forEach((col, j) => {
                if (col == "index") {
                    //pass
                } else {
                    const td = document.createElement("td");
                    td.textContent = entry[col];
                    tr.appendChild(td);
                    if (j >= 3 && j <= 10) {
                        td.classList.add("cell-article");
                    } else if (j > 10) {
                        td.classList.add("cell-media");
                    } else {
                        td.classList.add("cell-info");
                    }
                }
            });
            table_body.appendChild(tr);
        });
        return header;
    }

    function is_float(string) {
        return string.match(/^\d+([\.,]\d+)?$/gi)
    }

    fetch("data.csv").then(res => res.text()).then(csv_string => {
        const array = parse_csv(csv_string);

        const header = inflate_table_data(array);

        function is_formula_valid(formula_string) {
            return formula_string.match(/^[a-z0-9\.,_ \(\)\+\*\-\/]+$/);
        }

        class Expr {

            constructor(op, left, right) {
                this.op = op;
                this.left = left;
                this.right = right;
            }

            parse_child(child_name, valid_tokens) {
                if (this[child_name] == null) {
                    throw new Error("Expression child is null");
                }
                if (typeof this[child_name] === "string") {
                    if (is_float(this[child_name])) {
                        this[child_name] = parseFloat(this[child_name])
                    } else if (valid_tokens.includes(this[child_name])) {
                        //pass
                    } else if (this[child_name].match(/[\/\+\*\-]/gi)) {
                        this[child_name] = build_formula_tree(this[child_name]);
                    } else {
                        throw new Error(`Invalid component "${ this[child_name] }"`);
                    }
                } else if (typeof this[child_name] === "number") {
                    // pass
                } else {
                    this[child_name].parse_children(valid_tokens);
                }
            }

            parse_children(valid_tokens) {
                this.parse_child("left", valid_tokens);
                this.parse_child("right", valid_tokens);
            }

            get_child_value(child_name, row) {
                if (typeof this[child_name] === "string") {
                    return row[this[child_name]];
                } else if (typeof this[child_name] === "number") {
                    return this[child_name];
                }
                return this[child_name].eval(row);
            }

            eval(row) {
                let value_left = this.get_child_value("left", row);
                let value_right = this.get_child_value("right", row);
                if (this.op == "+") {
                    return value_left + value_right;
                } else if (this.op == "-") {
                    return value_left - value_right;
                } else if (this.op == "*") {
                    return value_left * value_right;
                } else if (this.op == "/") {
                    return value_left / value_right;
                }
            }

        }

        function split_formula_string_components(formula_string) {
            const components = [];
            let depth = 0;
            const split = formula_string.split(/([ \/\+\*\-\(\)])/gi);
            let current_component = "";
            for (let i = 0; i < split.length; i++) {
                if (split[i] == "") continue;
                if (split[i] == "(") {
                    depth++;
                    if (depth == 1) {
                        current_component = "";
                    } else {
                        current_component = current_component.concat("(");
                    }
                    continue;
                }
                if (split[i] == ")") {
                    depth--;
                    if (depth == 0) {
                        components.push(current_component);
                    } else {
                        current_component = current_component.concat(")");
                    }
                    continue;
                }
                if (depth == 0 && split[i] != " ") {
                    components.push(split[i]);
                    continue
                }
                if (depth >= 1) {
                    current_component = current_component.concat(split[i]);
                    continue;
                }
            }
            return components;
        }

        function parse_formula_components(components) {
            if (components.length == 0) {
                throw new Error("Component list is empty");
            }
            if (components.length == 1) {
                return new Expr("+", components[0], 0);
            }

            const root = new Expr();
            const number_of_operators = (components.length - 1) / 2;

            // Parse operators + and -
            for (let i = 0; i < number_of_operators; i++) {
                let j = 1 + 2 * i;
                if (components[j] == "+" || components[j] == "-") {
                    root.op = components[j];
                    root.left = parse_formula_components(components.slice(0, j));
                    root.right = parse_formula_components(components.slice(j + 1));
                    return root;
                }
            }

            // Parse other operators
            root.op = components[components.length - 2];
            root.right = components[components.length - 1];
            root.left = parse_formula_components(components.slice(0, components.length - 2));
            return root;
        }

        function build_formula_tree(formula_string) {
            let components = split_formula_string_components(formula_string);
            let root = parse_formula_components(components);
            root.parse_children(header);
            return root;
        }

        function parse_formula(string) {
            if (!is_formula_valid(string)) return;
            return build_formula_tree(string);
        }

        function compute_formula() {
            console.log("Computing formula");
            const formula_string = document.getElementById("input-formula").value;
            const formula = parse_formula(formula_string);
            console.log("Formula:", formula);
            const output = [];
            for (let i = 5; i < array.length; i++) {
                output.push({
                    title: array[i].titre_article,
                    score: formula.eval(array[i])
                })
            }
            output.sort((a, b) => { return b.score - a.score });
            console.log("Output:", output);
            const table_output_body = document.querySelector("#table-output tbody");
            table_output_body.innerHTML = "";
            output.slice(0, 3).forEach((row, i) => {
                const tr = document.createElement("tr");
                tr.innerHTML = `<td>${ i + 1}</td><td>${ row.title }</td><td>${ row.score.toFixed(1) }</td>`;
                table_output_body.appendChild(tr);
            });
        }

        document.getElementById("form-formula").addEventListener("submit", (event) => {
            event.preventDefault();
            try {
                compute_formula();
            } catch (error) {
                console.error(error);
                alert(`Une erreur est survenue. La formule est-elle correcte ?\n${ error }`);
            }
        });

    });

});